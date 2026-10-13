import { BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { Principal } from '../../platform/policy/policy.types';
import { AcceptStaffInvitationDto, ChangeAssignmentDto, InviteStaffDto } from './staff.dto';
import { normalizeBdPhone } from './phone';
import { checkPassword } from './password-policy';
import { PasswordService } from './password.service';
import { SmsSender } from './sms.port';

const INVITE_DAYS = 7;
const sha = (v: string) => createHash('sha256').update(v).digest('hex');
const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

interface Tier {
  id: string;
  code: string;
  role_code: string;
  tier_rank: number | null;
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
      const tier = await this.tier(tx, dto.tierCode, dto.roleCode);
      await this.requireAuthority(tx, principal.userId, tier);
      const areaIds = await this.checkAreas(tx, dto.roleCode, dto.areaIds ?? []);
      const exists = await tx.query('SELECT 1 FROM idn.app_user WHERE phone_e164 = $1 AND deleted_at IS NULL', [phone]);
      if (exists.rows[0]) throw new ConflictException({ code: 'ACCOUNT_EXISTS' });
      await tx.query(`UPDATE idn.staff_invitation SET status = 'Revoked', version = version + 1, updated_at = now() WHERE phone_e164 = $1 AND status = 'Pending'`, [phone]);
      const row = await tx.query<{ id: string }>(
        `INSERT INTO idn.staff_invitation (phone_e164, role_code, invited_by, token_hash, expires_at, permission_set_id, area_ids)
         VALUES ($1, $2::role_code, $3, $4, now() + make_interval(days => $5), $6, $7::uuid[]) RETURNING id`,
        [phone, dto.roleCode, principal.userId, sha(token), INVITE_DAYS, tier.id, areaIds],
      );
      await this.outbox.append(tx, { aggregateType: 'STAFF_INVITATION', aggregateId: row.rows[0].id, eventType: 'StaffInvited', payload: { roleCode: dto.roleCode, tierCode: tier.code } });
      await this.audit.record(tx, {
        category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM',
        entityType: 'staff_invitation', entityId: row.rows[0].id, correlationId: randomUUID(),
      });
      return row.rows[0].id;
    });
    await this.sms.send(phone, `BBDA staff invitation. Use this code to set up your account: ${token}. It is valid for ${INVITE_DAYS} days.`);
    return { id: created, expiresInDays: INVITE_DAYS };
  }

  async list(principal: Principal) {
    void principal;
    const { rows } = await this.db.query(
      `SELECT i.id, right(i.phone_e164, 4) AS "phoneLast4", i.role_code::text AS "roleCode", s.code AS "tierCode", i.area_ids AS "areaIds",
              i.status::text AS status, i.expires_at AS "expiresAt", i.created_at AS "createdAt", i.accepted_at AS "acceptedAt"
         FROM idn.staff_invitation i LEFT JOIN idn.permission_set s ON s.id = i.permission_set_id ORDER BY i.created_at DESC LIMIT 200`,
    );
    return rows;
  }

  async revoke(principal: Principal, id: string) {
    return this.db.transaction(async (tx) => {
      const res = await tx.query(
        `UPDATE idn.staff_invitation SET status = 'Revoked', version = version + 1, updated_at = now() WHERE id = $1 AND status = 'Pending'`,
        [id],
      );
      if (!res.rowCount) throw new NotFoundException({ code: 'INVITATION_NOT_FOUND' });
      await this.outbox.append(tx, { aggregateType: 'STAFF_INVITATION', aggregateId: id, eventType: 'StaffInvitationRevoked', payload: { by: principal.userId } });
      return { id, status: 'Revoked' };
    });
  }

  async accept(dto: AcceptStaffInvitationDto) {
    return this.db.transaction(async (tx) => {
      const found = await tx.query<{ id: string; phone_e164: string; role_code: string; invited_by: string; permission_set_id: string; area_ids: string[]; expires_at: Date; status: string }>(
        `SELECT id, phone_e164, role_code::text AS role_code, invited_by, permission_set_id, area_ids, expires_at, status::text AS status
           FROM idn.staff_invitation WHERE token_hash = $1 FOR UPDATE`,
        [sha(dto.token)],
      );
      const inv = found.rows[0];
      if (!inv || inv.status !== 'Pending') throw new NotFoundException({ code: 'INVITATION_INVALID' });
      if (inv.expires_at.getTime() <= Date.now()) {
        await tx.query(`UPDATE idn.staff_invitation SET status = 'Expired', version = version + 1, updated_at = now() WHERE id = $1`, [inv.id]);
        throw fail('INVITATION_EXPIRED', HttpStatus.GONE);
      }
      const problems = checkPassword(dto.password, inv.phone_e164, true);
      if (problems.length) throw new BadRequestException({ code: 'PASSWORD_REJECTED', problems });
      const exists = await tx.query('SELECT 1 FROM idn.app_user WHERE phone_e164 = $1 AND deleted_at IS NULL', [inv.phone_e164]);
      if (exists.rows[0]) throw new ConflictException({ code: 'ACCOUNT_EXISTS' });

      const hash = await this.passwords.hash(dto.password);
      const user = await tx.query<{ id: string }>(
        `INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff, preferred_language) VALUES ($1, now(), true, $2) RETURNING id`,
        [inv.phone_e164, dto.language],
      );
      const userId = user.rows[0].id;
      await tx.query(
        `INSERT INTO idn.credential (user_id, password_hash, hash_algorithm, hash_params, password_set_at)
         VALUES ($1, $2, 'ARGON2ID', '{"memoryKiB":19456,"timeCost":2,"parallelism":1}'::jsonb, now())`,
        [userId, hash],
      );
      const role = await tx.query<{ id: string }>(
        `INSERT INTO idn.user_role (user_id, role_id, status, assigned_by, assigned_at)
         SELECT $1, id, 'Active', $3, now() FROM idn.role WHERE code = $2::role_code RETURNING id`,
        [userId, inv.role_code, inv.invited_by],
      );
      await this.applyAssignment(tx, userId, role.rows[0].id, inv.permission_set_id, inv.area_ids, inv.invited_by);
      await tx.query(
        `UPDATE idn.staff_invitation SET status = 'Accepted', accepted_user_id = $2, accepted_at = now(), version = version + 1, updated_at = now() WHERE id = $1`,
        [inv.id, userId],
      );
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'StaffActivated', payload: { roleCode: inv.role_code } });
      await this.audit.record(tx, {
        category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: userId, actorRole: inv.role_code as 'SUP' | 'MOD' | 'ADM',
        entityType: 'app_user', entityId: userId, correlationId: randomUUID(),
      });
      return { userId, roleCode: inv.role_code };
    });
  }

  async changeAssignment(principal: Principal, userId: string, dto: ChangeAssignmentDto) {
    return this.db.transaction(async (tx) => {
      if (userId === principal.userId) throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
      const target = await tx.query<{ role_id: string; user_role_id: string; role_code: string }>(
        `SELECT r.id AS role_id, ur.id AS user_role_id, r.code::text AS role_code
           FROM idn.app_user u JOIN idn.user_role ur ON ur.user_id = u.id AND ur.status = 'Active' JOIN idn.role r ON r.id = ur.role_id
          WHERE u.id = $1 AND u.is_staff AND u.deleted_at IS NULL AND r.code IN ('SUP','MOD','ADM') FOR UPDATE OF ur`,
        [userId],
      );
      const t = target.rows[0];
      if (!t) throw new NotFoundException({ code: 'STAFF_NOT_FOUND' });
      const tier = await this.tier(tx, dto.tierCode, t.role_code);
      await this.requireAuthority(tx, principal.userId, tier);
      const areaIds = await this.checkAreas(tx, t.role_code, dto.areaIds ?? []);
      await tx.query(
        `UPDATE idn.user_permission_set SET status = 'Revoked', revoked_by = $2, revoked_at = now(), revoke_reason = $3, version = version + 1, updated_at = now()
          WHERE user_id = $1 AND status = 'Active' AND permission_set_id IN (SELECT id FROM idn.permission_set WHERE kind = 'TIER')`,
        [userId, principal.userId, dto.reason],
      );
      await tx.query(`UPDATE idn.permission_scope SET revoked_at = now(), updated_at = now() WHERE user_role_id = $1 AND revoked_at IS NULL`, [t.user_role_id]);
      await this.applyAssignment(tx, userId, t.user_role_id, tier.id, areaIds, principal.userId);
      await tx.query(`UPDATE idn.session SET revoked_at = now(), revoke_reason = 'ROLE_CHANGED', updated_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
      await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'StaffAssignmentChanged', payload: { tierCode: tier.code, by: principal.userId } });
      await this.audit.record(tx, {
        category: 'PERMISSION', action: 'ASSIGN', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM', entityType: 'app_user', entityId: userId,
        reasonCode: 'ROLE_ASSIGNMENT', reasonText: dto.reason, correlationId: randomUUID(),
      });
      return { userId, tierCode: tier.code, areaIds };
    });
  }

  private async applyAssignment(tx: Db, userId: string, userRoleId: string, tierId: string, areaIds: string[], grantedBy: string) {
    await tx.query(
      `INSERT INTO idn.user_permission_set (user_id, permission_set_id, status, granted_by, effective_from) VALUES ($1, $2, 'Active', $3, now())`,
      [userId, tierId, grantedBy],
    );
    for (const areaId of areaIds) {
      await tx.query(`INSERT INTO idn.permission_scope (user_role_id, scope_code, area_id, granted_by) VALUES ($1, 'scope.area', $2, $3)`, [userRoleId, areaId, grantedBy]);
    }
  }

  private async tier(tx: Db, code: string, roleCode: string): Promise<Tier> {
    const { rows } = await tx.query<Tier>(
      `SELECT id, code, role_code::text AS role_code, tier_rank FROM idn.permission_set WHERE code = $1 AND kind = 'TIER' AND status = 'Active' AND role_code = $2::role_code`,
      [code, roleCode],
    );
    if (!rows[0]) throw fail('TIER_NOT_FOUND', HttpStatus.NOT_FOUND);
    return rows[0];
  }

  private async requireAuthority(tx: Db, grantorId: string, tier: Tier) {
    if (tier.role_code !== 'ADM') return;
    const { rows } = await tx.query<{ ok: boolean }>(
      `SELECT EXISTS (
         SELECT 1 FROM idn.user_permission_set u JOIN idn.permission_set s ON s.id = u.permission_set_id
          WHERE u.user_id = $1 AND u.status = 'Active' AND u.effective_from <= now() AND (u.expires_at IS NULL OR u.expires_at > now())
            AND s.kind = 'TIER' AND s.role_code = 'ADM' AND COALESCE(s.tier_rank, 0) >= $2) AS ok`,
      [grantorId, tier.tier_rank ?? 0],
    );
    if (!rows[0].ok) throw new HttpException({ code: 'TIER_ABOVE_GRANTOR' }, HttpStatus.FORBIDDEN);
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
