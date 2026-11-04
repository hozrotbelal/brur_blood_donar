import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { Principal, RoleCode } from '../../platform/policy/policy.types';
import { AcceptStaffInvitationDto, ChangeAssignmentDto, InviteStaffDto } from './staff.dto';
import { normalizeBdPhone } from './phone';
import { checkPassword } from './password-policy';
import { PasswordService } from './password.service';
import { appUser, credential, permissionScope, permissionSet, role, session, staffInvitation, userPermissionSet, userRole } from './schema';
import { SmsSender } from './sms.port';

const INVITE_DAYS = 7;
const HASH_PARAMS = { memoryKiB: 19456, timeCost: 2, parallelism: 1 };
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

interface Tier {
  id: string;
  code: string;
  roleCode: RoleCode;
  tierRank: number | null;
}

@Injectable()
export class StaffService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly passwords: PasswordService,
    private readonly sms: SmsSender,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async invite(principal: Principal, dto: InviteStaffDto) {
    const phone = normalizeBdPhone(dto.phone);
    if (!phone) throw new BadRequestException({ code: 'PHONE_INVALID' });
    const token = randomBytes(24).toString('base64url');
    const created = await this.db.transaction(async (tx) => {
      const tier = await this.tier(tx, dto.tierCode, dto.roleCode as RoleCode);
      await this.requireAuthority(tx, principal.userId, tier);
      const areaIds = await this.checkAreas(tx, dto.roleCode, dto.areaIds ?? []);
      const [exists] = await tx.orm.select({ id: appUser.id }).from(appUser).where(and(eq(appUser.phoneE164, phone), isNull(appUser.deletedAt)));
      if (exists) throw new ConflictException({ code: 'ACCOUNT_EXISTS' });
      await tx.orm
        .update(staffInvitation)
        .set({ status: 'Revoked', version: sql`${staffInvitation.version} + 1`, updatedAt: new Date() })
        .where(and(eq(staffInvitation.phoneE164, phone), eq(staffInvitation.status, 'Pending')));
      const [row] = await tx.orm
        .insert(staffInvitation)
        .values({
          phoneE164: phone, roleCode: dto.roleCode as RoleCode, invitedBy: principal.userId, tokenHash: sha(token),
          expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), permissionSetId: tier.id, areaIds,
        })
        .returning({ id: staffInvitation.id });
      await this.outbox.append(tx, { aggregateType: 'STAFF_INVITATION', aggregateId: row.id, eventType: 'StaffInvited', payload: { roleCode: dto.roleCode, tierCode: tier.code } });
      await this.audit.record(tx, {
        category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM',
        entityType: 'staff_invitation', entityId: row.id, correlationId: randomUUID(),
      });
      return row.id;
    });
    await this.sms.send(phone, `BBDA staff invitation. Use this code to set up your account: ${token}. It is valid for ${INVITE_DAYS} days.`);
    return { id: created, expiresInDays: INVITE_DAYS };
  }

  async list(principal: Principal) {
    void principal;
    return this.db.orm
      .select({
        id: staffInvitation.id, phoneLast4: sql<string>`right(${staffInvitation.phoneE164}, 4)`, roleCode: staffInvitation.roleCode, tierCode: permissionSet.code,
        areaIds: staffInvitation.areaIds, status: staffInvitation.status, expiresAt: staffInvitation.expiresAt, createdAt: staffInvitation.createdAt, acceptedAt: staffInvitation.acceptedAt,
      })
      .from(staffInvitation)
      .leftJoin(permissionSet, eq(permissionSet.id, staffInvitation.permissionSetId))
      .orderBy(desc(staffInvitation.createdAt))
      .limit(200);
  }

  async revoke(principal: Principal, id: string) {
    return this.db.transaction(async (tx) => {
      const res = await tx.orm
        .update(staffInvitation)
        .set({ status: 'Revoked', version: sql`${staffInvitation.version} + 1`, updatedAt: new Date() })
        .where(and(eq(staffInvitation.id, id), eq(staffInvitation.status, 'Pending')));
      if (!res.rowCount) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
      await this.outbox.append(tx, { aggregateType: 'STAFF_INVITATION', aggregateId: id, eventType: 'StaffInvitationRevoked', payload: { by: principal.userId } });
      return { id, status: 'Revoked' };
    });
  }

  async accept(dto: AcceptStaffInvitationDto) {
    return this.db.transaction(async (tx) => {
      const [inv] = await tx.orm
        .select({
          id: staffInvitation.id, phone: staffInvitation.phoneE164, roleCode: staffInvitation.roleCode, invitedBy: staffInvitation.invitedBy,
          permissionSetId: staffInvitation.permissionSetId, areaIds: staffInvitation.areaIds, expiresAt: staffInvitation.expiresAt, status: staffInvitation.status,
        })
        .from(staffInvitation)
        .where(eq(staffInvitation.tokenHash, sha(dto.token)))
        .for('update');
      if (!inv || inv.status !== 'Pending') throw new NotFoundException({ code: 'INVITATION_INVALID' });
      if (inv.expiresAt.getTime() <= Date.now()) {
        await tx.orm.update(staffInvitation).set({ status: 'Expired', version: sql`${staffInvitation.version} + 1`, updatedAt: new Date() }).where(eq(staffInvitation.id, inv.id));
        throw fail('INVITATION_EXPIRED', HttpStatus.GONE);
      }
      const problems = checkPassword(dto.password, inv.phone, true);
      if (problems.length) throw new BadRequestException({ code: 'PASSWORD_REJECTED', problems });
      const [exists] = await tx.orm.select({ id: appUser.id }).from(appUser).where(and(eq(appUser.phoneE164, inv.phone), isNull(appUser.deletedAt)));
      if (exists) throw new ConflictException({ code: 'ACCOUNT_EXISTS' });

      const hash = await this.passwords.hash(dto.password);
      const [user] = await tx.orm
        .insert(appUser)
        .values({ phoneE164: inv.phone, phoneVerifiedAt: new Date(), isStaff: true, preferredLanguage: dto.language })
        .returning({ id: appUser.id });
      const userId = user.id;
      await tx.orm.insert(credential).values({ userId, passwordHash: hash, hashAlgorithm: 'ARGON2ID', hashParams: HASH_PARAMS, passwordSetAt: new Date() });
      const [roleRow] = await tx.orm.select({ id: role.id }).from(role).where(eq(role.code, inv.roleCode));
      const [assigned] = await tx.orm
        .insert(userRole)
        .values({ userId, roleId: roleRow.id, status: 'Active', assignedBy: inv.invitedBy, assignedAt: new Date() })
        .returning({ id: userRole.id });
      if (!inv.permissionSetId) throw fail('INVITATION_INVALID', HttpStatus.NOT_FOUND);
      await this.applyAssignment(tx, userId, assigned.id, inv.permissionSetId, inv.areaIds, inv.invitedBy);
      await tx.orm
        .update(staffInvitation)
        .set({ status: 'Accepted', acceptedUserId: userId, acceptedAt: new Date(), version: sql`${staffInvitation.version} + 1`, updatedAt: new Date() })
        .where(eq(staffInvitation.id, inv.id));
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'StaffActivated', payload: { roleCode: inv.roleCode } });
      await this.audit.record(tx, {
        category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: userId, actorRole: inv.roleCode as 'SUP' | 'MOD' | 'ADM',
        entityType: 'app_user', entityId: userId, correlationId: randomUUID(),
      });
      return { userId, roleCode: inv.roleCode };
    });
  }

  async changeAssignment(principal: Principal, userId: string, dto: ChangeAssignmentDto) {
    return this.db.transaction(async (tx) => {
      if (userId === principal.userId) throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
      const [t] = await tx.orm
        .select({ roleId: role.id, userRoleId: userRole.id, roleCode: role.code })
        .from(appUser)
        .innerJoin(userRole, and(eq(userRole.userId, appUser.id), eq(userRole.status, 'Active')))
        .innerJoin(role, eq(role.id, userRole.roleId))
        .where(and(eq(appUser.id, userId), eq(appUser.isStaff, true), isNull(appUser.deletedAt), inArray(role.code, ['SUP', 'MOD', 'ADM'])))
        .for('update');
      if (!t) throw new NotFoundException({ code: 'STAFF_NOT_FOUND' });
      const tier = await this.tier(tx, dto.tierCode, t.roleCode);
      await this.requireAuthority(tx, principal.userId, tier);
      const areaIds = await this.checkAreas(tx, t.roleCode, dto.areaIds ?? []);
      const tierSets = tx.orm.select({ id: permissionSet.id }).from(permissionSet).where(eq(permissionSet.kind, 'TIER'));
      await tx.orm
        .update(userPermissionSet)
        .set({ status: 'Revoked', revokedBy: principal.userId, revokedAt: new Date(), revokeReason: dto.reason, version: sql`${userPermissionSet.version} + 1`, updatedAt: new Date() })
        .where(and(eq(userPermissionSet.userId, userId), eq(userPermissionSet.status, 'Active'), inArray(userPermissionSet.permissionSetId, tierSets)));
      await tx.orm.update(permissionScope).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(eq(permissionScope.userRoleId, t.userRoleId), isNull(permissionScope.revokedAt)));
      await this.applyAssignment(tx, userId, t.userRoleId, tier.id, areaIds, principal.userId);
      await tx.orm
        .update(session)
        .set({ revokedAt: new Date(), revokeReason: 'ROLE_CHANGED', updatedAt: new Date() })
        .where(and(eq(session.userId, userId), isNull(session.revokedAt)));
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'StaffAssignmentChanged', payload: { tierCode: tier.code, by: principal.userId } });
      await this.audit.record(tx, {
        category: 'PERMISSION', action: 'ASSIGN', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM', entityType: 'app_user', entityId: userId,
        reasonCode: 'ROLE_ASSIGNMENT', reasonText: dto.reason, correlationId: randomUUID(),
      });
      return { userId, tierCode: tier.code, areaIds };
    });
  }

  private async applyAssignment(tx: Db, userId: string, userRoleId: string, tierId: string, areaIds: string[], grantedBy: string) {
    await tx.orm.insert(userPermissionSet).values({ userId, permissionSetId: tierId, status: 'Active', grantedBy, effectiveFrom: new Date() });
    if (areaIds.length) {
      await tx.orm.insert(permissionScope).values(areaIds.map((areaId) => ({ userRoleId, scopeCode: 'scope.area' as const, areaId, grantedBy })));
    }
  }

  private async tier(tx: Db, code: string, roleCode: RoleCode): Promise<Tier> {
    const [row] = await tx.orm
      .select({ id: permissionSet.id, code: permissionSet.code, roleCode: permissionSet.roleCode, tierRank: permissionSet.tierRank })
      .from(permissionSet)
      .where(and(eq(permissionSet.code, code), eq(permissionSet.kind, 'TIER'), eq(permissionSet.status, 'Active'), eq(permissionSet.roleCode, roleCode)));
    if (!row) throw fail('TIER_NOT_FOUND', HttpStatus.NOT_FOUND);
    return row;
  }

  private async requireAuthority(tx: Db, grantorId: string, tier: Tier) {
    if (tier.roleCode !== 'ADM') return;
    const [row] = await tx.orm
      .select({ id: userPermissionSet.id })
      .from(userPermissionSet)
      .innerJoin(permissionSet, eq(permissionSet.id, userPermissionSet.permissionSetId))
      .where(
        and(
          eq(userPermissionSet.userId, grantorId), eq(userPermissionSet.status, 'Active'), sql`${userPermissionSet.effectiveFrom} <= now()`,
          sql`(${userPermissionSet.expiresAt} is null or ${userPermissionSet.expiresAt} > now())`, eq(permissionSet.kind, 'TIER'), eq(permissionSet.roleCode, 'ADM'),
          sql`coalesce(${permissionSet.tierRank}, 0) >= ${tier.tierRank ?? 0}`,
        ),
      )
      .limit(1);
    if (!row) throw new HttpException({ code: 'TIER_ABOVE_GRANTOR' }, HttpStatus.FORBIDDEN);
  }

  private async checkAreas(tx: Db, roleCode: string, areaIds: string[]): Promise<string[]> {
    const unique = [...new Set(areaIds)];
    if (roleCode === 'SUP' && unique.length === 0) throw fail('AREA_REQUIRED');
    if (unique.length === 0) return [];
    const found = await tx.query<{ id: string }>('SELECT id FROM cfg.area WHERE id = ANY($1::uuid[]) AND is_active', [unique]);
    if (found.rows.length !== unique.length) throw fail('AREA_NOT_FOUND', HttpStatus.NOT_FOUND);
    return unique;
  }
}
