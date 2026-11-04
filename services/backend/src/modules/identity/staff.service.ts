import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { Principal, RoleCode } from '../../platform/policy/policy.types';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { openCasesOwnedBy } from '../case-workflow/read-model.public';
import { AcceptStaffInvitationDto, ChangeAssignmentDto, InviteStaffDto, StaffMemberDto } from './staff.dto';
import { normalizeBdPhone } from './phone';
import { checkPassword } from './password-policy';
import { PasswordService } from './password.service';
import { appUser, credential, device, permissionScope, permissionSet, role, session, staffInvitation, userPermissionSet, userRole } from './schema';
import { SmsSender } from './sms.port';

const INVITE_DAYS = 7;
const HASH_PARAMS = { memoryKiB: 19456, timeCost: 2, parallelism: 1 };
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const PRIMARY_TIER = 'TIER_PRIMARY_ADMINISTRATOR';
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
    private readonly history: StatusHistoryService,
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
      await this.guardTarget(tx, principal.userId, userId, tier);
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

  async staffList(): Promise<StaffMemberDto[]> {
    const users = await this.db.orm
      .select({ userId: appUser.id, displayName: appUser.displayName, phoneLast4: sql<string>`right(${appUser.phoneE164}, 4)`, accountStatus: appUser.accountStatus, lastLoginAt: appUser.lastLoginAt })
      .from(appUser)
      .where(and(eq(appUser.isStaff, true), isNull(appUser.deletedAt)))
      .orderBy(desc(appUser.createdAt))
      .limit(500);
    const ids = users.map((u) => u.userId);
    if (ids.length === 0) return [];
    const roles = await this.db.orm
      .select({ userId: userRole.userId, userRoleId: userRole.id, roleCode: role.code, status: userRole.status })
      .from(userRole)
      .innerJoin(role, and(eq(role.id, userRole.roleId), eq(role.isStaff, true)))
      .where(inArray(userRole.userId, ids))
      .orderBy(desc(userRole.assignedAt));
    const tiers = await this.db.orm
      .select({ userId: userPermissionSet.userId, code: permissionSet.code })
      .from(userPermissionSet)
      .innerJoin(permissionSet, and(eq(permissionSet.id, userPermissionSet.permissionSetId), eq(permissionSet.kind, 'TIER')))
      .where(and(inArray(userPermissionSet.userId, ids), eq(userPermissionSet.status, 'Active')));
    const activeRoleIds = roles.filter((r) => r.status === 'Active').map((r) => r.userRoleId);
    const scopes = activeRoleIds.length
      ? await this.db.orm
          .select({ userRoleId: permissionScope.userRoleId, areaId: permissionScope.areaId })
          .from(permissionScope)
          .where(and(inArray(permissionScope.userRoleId, activeRoleIds), isNull(permissionScope.revokedAt)))
      : [];
    return users.map((u) => {
      const current = roles.find((r) => r.userId === u.userId && r.status === 'Active') ?? roles.find((r) => r.userId === u.userId);
      const active = current?.status === 'Active';
      return {
        userId: u.userId, displayName: u.displayName, phoneLast4: u.phoneLast4, roleCode: current?.roleCode ?? null,
        tierCode: active ? (tiers.find((t) => t.userId === u.userId)?.code ?? null) : null,
        areaIds: active ? scopes.filter((s) => s.userRoleId === current.userRoleId && s.areaId).map((s) => s.areaId as string) : [],
        status: !active ? 'Deactivated' : u.accountStatus === 'Active' ? 'Active' : u.accountStatus === 'Locked' ? 'Locked' : 'Suspended',
        lastLoginAt: u.lastLoginAt,
      };
    });
  }

  async deactivate(principal: Principal, userId: string, reason: string) {
    return this.db.transaction(async (tx) => {
      if (userId === principal.userId) throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
      const t = await this.lockStaffRole(tx, userId);
      await this.guardTarget(tx, principal.userId, userId, null);
      const now = new Date();
      const tierSets = tx.orm.select({ id: permissionSet.id }).from(permissionSet).where(eq(permissionSet.kind, 'TIER'));
      await tx.orm
        .update(userPermissionSet)
        .set({ status: 'Revoked', revokedBy: principal.userId, revokedAt: now, revokeReason: reason, version: sql`${userPermissionSet.version} + 1`, updatedAt: now })
        .where(and(eq(userPermissionSet.userId, userId), eq(userPermissionSet.status, 'Active'), inArray(userPermissionSet.permissionSetId, tierSets)));
      await tx.orm.update(permissionScope).set({ revokedAt: now, updatedAt: now }).where(and(eq(permissionScope.userRoleId, t.userRoleId), isNull(permissionScope.revokedAt)));
      await tx.orm
        .update(userRole)
        .set({ status: 'Revoked', revokedBy: principal.userId, revokedAt: now, reason, version: sql`${userRole.version} + 1`, updatedAt: now })
        .where(eq(userRole.id, t.userRoleId));
      await this.history.record(tx, {
        entityType: 'USER_ROLE', entityId: t.userRoleId, from: 'Active', to: 'Revoked', actorUserId: principal.userId, actorRole: 'ADM', source: 'USER',
        reasonCode: 'STAFF_DEACTIVATED', reason, correlationId: randomUUID(),
      });
      await this.revokeAccess(tx, userId, 'ADMIN');
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'StaffDeactivated', payload: { roleCode: t.roleCode, by: principal.userId } });
      await this.audit.record(tx, {
        category: 'PERMISSION', action: 'PERMISSION_REVOKED', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM', entityType: 'app_user', entityId: userId,
        reasonCode: 'STAFF_DEACTIVATED', reasonText: reason, correlationId: randomUUID(),
      });
      return { userId, status: 'Deactivated', openCases: await openCasesOwnedBy(tx, userId) };
    });
  }

  async resetDevices(principal: Principal, userId: string, reason: string) {
    return this.db.transaction(async (tx) => {
      if (userId === principal.userId) throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
      await this.lockStaffRole(tx, userId);
      await this.guardTarget(tx, principal.userId, userId, await this.currentTier(tx, userId));
      const devicesRevoked = await this.revokeAccess(tx, userId, 'DEVICE_REVOKED');
      await this.audit.record(tx, {
        category: 'AUTH', action: 'SESSIONS_REVOKED', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM', entityType: 'app_user', entityId: userId,
        reasonCode: 'DEVICE_RESET', reasonText: reason, correlationId: randomUUID(),
      });
      return { userId, devicesRevoked };
    });
  }

  async assertCanManage(tx: Db, grantorId: string, targetUserId: string) {
    if (targetUserId === grantorId) throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
    await this.lockStaffRole(tx, targetUserId);
    await this.guardTarget(tx, grantorId, targetUserId, await this.currentTier(tx, targetUserId));
  }

  private async lockStaffRole(tx: Db, userId: string) {
    const [t] = await tx.orm
      .select({ userRoleId: userRole.id, roleCode: role.code })
      .from(appUser)
      .innerJoin(userRole, and(eq(userRole.userId, appUser.id), eq(userRole.status, 'Active')))
      .innerJoin(role, eq(role.id, userRole.roleId))
      .where(and(eq(appUser.id, userId), eq(appUser.isStaff, true), isNull(appUser.deletedAt), inArray(role.code, ['SUP', 'MOD', 'ADM'])))
      .for('update');
    if (!t) throw new NotFoundException({ code: 'STAFF_NOT_FOUND' });
    return t;
  }

  private async revokeAccess(tx: Db, userId: string, reason: 'ADMIN' | 'DEVICE_REVOKED'): Promise<number> {
    const now = new Date();
    const devices = await tx.orm
      .update(device)
      .set({ signOutStatus: 'Revoked', revokedAt: now, staffMfaVerifiedAt: null, isTrusted: false, updatedAt: now })
      .where(and(eq(device.userId, userId), ne(device.signOutStatus, 'Revoked')))
      .returning({ id: device.id });
    await tx.orm.update(session).set({ revokedAt: now, revokeReason: reason, updatedAt: now }).where(and(eq(session.userId, userId), isNull(session.revokedAt)));
    return devices.length;
  }

  private async currentTier(tx: Db, userId: string): Promise<Tier | null> {
    const [row] = await tx.orm
      .select({ id: permissionSet.id, code: permissionSet.code, roleCode: permissionSet.roleCode, tierRank: permissionSet.tierRank })
      .from(userPermissionSet)
      .innerJoin(permissionSet, and(eq(permissionSet.id, userPermissionSet.permissionSetId), eq(permissionSet.kind, 'TIER')))
      .where(and(eq(userPermissionSet.userId, userId), eq(userPermissionSet.status, 'Active')));
    return (row as Tier | undefined) ?? null;
  }

  private async guardTarget(tx: Db, grantorId: string, targetUserId: string, next: Tier | null) {
    const current = await this.currentTier(tx, targetUserId);
    if (current?.roleCode === 'ADM') await this.requireAuthority(tx, grantorId, current);
    if (current?.code === PRIMARY_TIER && next?.code !== PRIMARY_TIER && (await this.otherPrimaryAdministrators(tx, targetUserId)) === 0) {
      throw fail('LAST_PRIMARY_ADMINISTRATOR', HttpStatus.CONFLICT);
    }
  }

  private async otherPrimaryAdministrators(tx: Db, exceptUserId: string): Promise<number> {
    const [row] = await tx.orm
      .select({ n: count() })
      .from(userPermissionSet)
      .innerJoin(permissionSet, and(eq(permissionSet.id, userPermissionSet.permissionSetId), eq(permissionSet.code, PRIMARY_TIER)))
      .innerJoin(appUser, and(eq(appUser.id, userPermissionSet.userId), eq(appUser.accountStatus, 'Active'), isNull(appUser.deletedAt)))
      .where(and(eq(userPermissionSet.status, 'Active'), ne(userPermissionSet.userId, exceptUserId), sql`(${userPermissionSet.expiresAt} is null or ${userPermissionSet.expiresAt} > now())`));
    return row.n;
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
      .innerJoin(permissionSet, and(eq(permissionSet.id, userPermissionSet.permissionSetId), eq(permissionSet.code, PRIMARY_TIER)))
      .where(
        and(
          eq(userPermissionSet.userId, grantorId), eq(userPermissionSet.status, 'Active'), sql`${userPermissionSet.effectiveFrom} <= now()`,
          sql`(${userPermissionSet.expiresAt} is null or ${userPermissionSet.expiresAt} > now())`,
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
