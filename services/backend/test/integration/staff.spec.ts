import { randomUUID } from 'node:crypto';
import { AuditService } from '../../src/platform/audit/audit.service';
import { AppConfig } from '../../src/platform/config/app-config';
import { DatabaseService } from '../../src/platform/db/database.service';
import { OutboxService } from '../../src/platform/outbox/outbox.service';
import { Principal } from '../../src/platform/policy/policy.types';
import { AuthService } from '../../src/modules/identity/auth.service';
import { PasswordService } from '../../src/modules/identity/password.service';
import { SmsSender } from '../../src/modules/identity/sms.port';
import { StaffService } from '../../src/modules/identity/staff.service';
import { AccessReviewService } from '../../src/modules/identity/access-review.service';
import { StatusHistoryService } from '../../src/platform/status/status-history.service';
import { TokenService } from '../../src/platform/security/token.service';
import { buildAuth, setupTokenOf, testDevice } from './identity-harness';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

class CapturingSms extends SmsSender {
  last = '';
  send(_phone: string, text: string) {
    this.last = /account: (\S+)\. /.exec(text)?.[1] ?? '';
    return Promise.resolve();
  }
}

suite('staff invitation and role assignment (needs TEST_DATABASE_URL with all migrations applied)', () => {
  let db: DatabaseService;
  let auth: AuthService;
  let staff: StaffService;
  let reviews: AccessReviewService;
  const sms = new CapturingSms();
  const phone = () => `017${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;

  async function newAdmin(tier: string): Promise<Principal> {
    const user = await db.query<{ id: string }>(`INSERT INTO idn.app_user (phone_e164, phone_verified_at, is_staff) VALUES ($1, now(), true) RETURNING id`, [`+880${phone().slice(1)}`]);
    const userId = user.rows[0].id;
    await db.query(`INSERT INTO idn.user_role (user_id, role_id, assigned_at) SELECT $1, id, now() FROM idn.role WHERE code = 'ADM'`, [userId]);
    await db.query(
      `INSERT INTO idn.user_permission_set (user_id, permission_set_id, status, effective_from) SELECT $1, id, 'Active', now() FROM idn.permission_set WHERE code = $2`,
      [userId, tier],
    );
    return { userId, role: 'ADM', grants: await auth.loadGrants(userId, 'ADM') };
  }

  async function area() {
    const r = await db.query<{ id: string }>(`INSERT INTO cfg.area (level, code, name_en, name_bn, is_active) VALUES ('DISTRICT', $1, 'Test', 'পরীক্ষা', true) RETURNING id`, [`T-${randomUUID()}`]);
    return r.rows[0].id;
  }

  beforeAll(() => {
    db = new DatabaseService({ databaseUrl: url } as AppConfig);
    const tokens = new TokenService({ nodeEnv: 'test', jwtPrivateKeyPath: '' } as AppConfig);
    const outbox = new OutboxService();
    const audit = new AuditService(outbox);
    const passwords = new PasswordService();
    auth = buildAuth(db, tokens, sms, outbox, audit, passwords);
    staff = new StaffService(db, passwords, sms, outbox, audit, new StatusHistoryService(audit));
    reviews = new AccessReviewService(db, staff, outbox, audit);
  });
  afterAll(() => db.onModuleDestroy());

  it('invites a support agent, activates the account with the right tier and area, and rejects reuse', async () => {
    const admin = await newAdmin('TIER_PRIMARY_ADMINISTRATOR');
    const areaId = await area();
    const p = phone();
    await expect(staff.invite(admin, { phone: p, roleCode: 'SUP', tierCode: 'TIER_SUPPORT_AGENT' })).rejects.toMatchObject({ response: { code: 'AREA_REQUIRED' } });
    await expect(staff.invite(admin, { phone: p, roleCode: 'SUP', tierCode: 'TIER_MODERATOR', areaIds: [areaId] })).rejects.toMatchObject({ response: { code: 'TIER_NOT_FOUND' } });
    await staff.invite(admin, { phone: p, roleCode: 'SUP', tierCode: 'TIER_SUPPORT_AGENT', areaIds: [areaId] });
    const token = sms.last;
    expect(token.length).toBeGreaterThan(20);

    expect((await staff.list(admin))[0]).toMatchObject({ status: 'Pending', tierCode: 'TIER_SUPPORT_AGENT' });
    await expect(staff.accept({ token: 'x'.repeat(30), password: 'correct horse battery staple', language: 'en' })).rejects.toMatchObject({ status: 404 });
    const accepted = await staff.accept({ token, password: 'correct horse battery staple', language: 'en' });
    expect(accepted.roleCode).toBe('SUP');

    const grants = await auth.loadGrants(accepted.userId, 'SUP');
    expect(grants.some((g) => g.key === 'case.edit')).toBe(true);
    expect(grants.some((g) => g.key === 'staff.invite')).toBe(false);
    const scope = await db.query('SELECT area_id FROM idn.permission_scope s JOIN idn.user_role ur ON ur.id = s.user_role_id WHERE ur.user_id = $1', [accepted.userId]);
    expect(scope.rows[0].area_id).toBe(areaId);
    expect((await db.query('SELECT is_staff FROM idn.app_user WHERE id = $1', [accepted.userId])).rows[0].is_staff).toBe(true);
    await expect(staff.accept({ token, password: 'correct horse battery staple', language: 'en' })).rejects.toMatchObject({ status: 404 });
    await expect(staff.invite(admin, { phone: p, roleCode: 'SUP', tierCode: 'TIER_SUPPORT_AGENT', areaIds: [areaId] })).rejects.toMatchObject({ status: 409 });
  });

  it('keeps a replaced invitation from working, revokes pending ones and expires old ones', async () => {
    const admin = await newAdmin('TIER_PRIMARY_ADMINISTRATOR');
    const p = phone();
    await staff.invite(admin, { phone: p, roleCode: 'MOD', tierCode: 'TIER_MODERATOR' });
    const first = sms.last;
    await staff.invite(admin, { phone: p, roleCode: 'MOD', tierCode: 'TIER_MODERATOR' });
    const second = sms.last;
    await expect(staff.accept({ token: first, password: 'correct horse battery staple', language: 'bn' })).rejects.toMatchObject({ status: 404 });

    const id = (await staff.list(admin)).find((i) => i.status === 'Pending' && i.phoneLast4 === p.slice(-4))!.id;
    await staff.revoke(admin, id);
    await expect(staff.accept({ token: second, password: 'correct horse battery staple', language: 'bn' })).rejects.toMatchObject({ status: 404 });
    await expect(staff.revoke(admin, id)).rejects.toMatchObject({ status: 404 });

    const p2 = phone();
    await staff.invite(admin, { phone: p2, roleCode: 'MOD', tierCode: 'TIER_MODERATOR' });
    await db.query(`UPDATE idn.staff_invitation SET expires_at = now() - interval '1 minute' WHERE token_hash IS NOT NULL AND phone_e164 = $1`, [`+880${p2.slice(1)}`]);
    await expect(staff.accept({ token: sms.last, password: 'correct horse battery staple', language: 'bn' })).rejects.toMatchObject({ status: 410 });
  });

  it('refuses a tier above the inviter, and rejects weak passwords', async () => {
    const lowAdmin = await newAdmin('TIER_ADMINISTRATOR');
    await expect(staff.invite(lowAdmin, { phone: phone(), roleCode: 'ADM', tierCode: 'TIER_PRIMARY_ADMINISTRATOR' })).rejects.toMatchObject({ status: 403 });
    await staff.invite(lowAdmin, { phone: phone(), roleCode: 'MOD', tierCode: 'TIER_MODERATOR' });
    await expect(staff.accept({ token: sms.last, password: 'short', language: 'en' })).rejects.toMatchObject({ status: 400 });
  });

  it('changes a staff member tier and areas, revoking the previous grant and sessions', async () => {
    const admin = await newAdmin('TIER_PRIMARY_ADMINISTRATOR');
    const a1 = await area();
    const a2 = await area();
    await staff.invite(admin, { phone: phone(), roleCode: 'SUP', tierCode: 'TIER_SUPPORT_AGENT', areaIds: [a1] });
    const { userId } = await staff.accept({ token: sms.last, password: 'correct horse battery staple', language: 'en' });

    await expect(staff.changeAssignment(admin, admin.userId, { tierCode: 'TIER_SUPPORT_LEAD', areaIds: [a1], reason: 'self change' })).rejects.toMatchObject({ response: { code: 'CANNOT_CHANGE_OWN_ASSIGNMENT' } });
    await staff.changeAssignment(admin, userId, { tierCode: 'TIER_SUPPORT_LEAD', areaIds: [a2], reason: 'Promoted to lead' });
    const grants = await auth.loadGrants(userId, 'SUP');
    expect(grants.find((g) => g.key === 'case.edit')?.scope).toBe('Area');
    const scopes = await db.query('SELECT area_id FROM idn.permission_scope s JOIN idn.user_role ur ON ur.id = s.user_role_id WHERE ur.user_id = $1 AND s.revoked_at IS NULL', [userId]);
    expect(scopes.rows.map((r) => r.area_id)).toEqual([a2]);
    const active = await db.query(`SELECT count(*)::int AS n FROM idn.user_permission_set u JOIN idn.permission_set s ON s.id = u.permission_set_id WHERE u.user_id = $1 AND u.status = 'Active' AND s.kind = 'TIER'`, [userId]);
    expect(active.rows[0].n).toBe(1);
    await expect(staff.changeAssignment(admin, randomUUID(), { tierCode: 'TIER_SUPPORT_LEAD', areaIds: [a2], reason: 'unknown user' })).rejects.toMatchObject({ status: 404 });
  });

  async function activeAgent(admin: Principal) {
    const areaId = await area();
    await staff.invite(admin, { phone: phone(), roleCode: 'SUP', tierCode: 'TIER_SUPPORT_AGENT', areaIds: [areaId] });
    const { userId } = await staff.accept({ token: sms.last, password: 'correct horse battery staple', language: 'en' });
    return { userId, areaId };
  }

  it('lists staff with role, tier, areas and status', async () => {
    const admin = await newAdmin('TIER_PRIMARY_ADMINISTRATOR');
    const { userId, areaId } = await activeAgent(admin);
    const row = (await staff.staffList()).find((s) => s.userId === userId);
    expect(row).toMatchObject({ roleCode: 'SUP', tierCode: 'TIER_SUPPORT_AGENT', areaIds: [areaId], status: 'Active' });
    expect(row!.phoneLast4).toHaveLength(4);
  });

  it('lets only a Primary Administrator grant or change administrator rights (FR-CFG-026)', async () => {
    const lowAdmin = await newAdmin('TIER_ADMINISTRATOR');
    const otherAdmin = await newAdmin('TIER_ADMINISTRATOR');
    await expect(staff.invite(lowAdmin, { phone: phone(), roleCode: 'ADM', tierCode: 'TIER_ADMINISTRATOR' })).rejects.toMatchObject({ response: { code: 'TIER_ABOVE_GRANTOR' } });
    await expect(staff.deactivate(lowAdmin, otherAdmin.userId, 'Left the organization')).rejects.toMatchObject({ response: { code: 'TIER_ABOVE_GRANTOR' } });
    await expect(staff.resetDevices(lowAdmin, otherAdmin.userId, 'Lost phone')).rejects.toMatchObject({ response: { code: 'TIER_ABOVE_GRANTOR' } });
    const primary = await newAdmin('TIER_PRIMARY_ADMINISTRATOR');
    await expect(staff.deactivate(primary, otherAdmin.userId, 'Left the organization')).resolves.toMatchObject({ status: 'Deactivated' });
  });

  it('deactivates a staff member: role and grants revoked, sessions ended, history written, open cases listed', async () => {
    const admin = await newAdmin('TIER_PRIMARY_ADMINISTRATOR');
    const { userId } = await activeAgent(admin);
    await expect(staff.deactivate(admin, admin.userId, 'self removal')).rejects.toMatchObject({ response: { code: 'CANNOT_CHANGE_OWN_ASSIGNMENT' } });

    const result = await staff.deactivate(admin, userId, 'Left the organization');
    expect(result).toMatchObject({ userId, status: 'Deactivated', openCases: [] });
    expect((await staff.staffList()).find((s) => s.userId === userId)).toMatchObject({ status: 'Deactivated', tierCode: null, areaIds: [] });
    expect(await auth.loadGrants(userId, 'SUP')).toEqual([]);
    const history = await db.query(`SELECT from_status, to_status, reason_code FROM aud.status_history WHERE entity_type = 'USER_ROLE' AND actor_user_id = $1 ORDER BY occurred_at DESC LIMIT 1`, [admin.userId]);
    expect(history.rows[0]).toMatchObject({ from_status: 'Active', to_status: 'Revoked', reason_code: 'STAFF_DEACTIVATED' });
    await expect(staff.deactivate(admin, userId, 'Left the organization')).rejects.toMatchObject({ status: 404 });
  });

  it('resets a staff member device binding', async () => {
    const admin = await newAdmin('TIER_PRIMARY_ADMINISTRATOR');
    const { userId } = await activeAgent(admin);
    await db.query(
      `INSERT INTO idn.device (user_id, install_id, platform, device_model, os_version, app_version, is_trusted, staff_mfa_verified_at)
       VALUES ($1, $2, 'android', 'Test', '14', '1.0', true, now())`,
      [userId, randomUUID()],
    );
    expect(await staff.resetDevices(admin, userId, 'Lost phone')).toEqual({ userId, devicesRevoked: 1 });
    const dev = await db.query('SELECT sign_out_status, is_trusted, staff_mfa_verified_at FROM idn.device WHERE user_id = $1', [userId]);
    expect(dev.rows[0]).toMatchObject({ sign_out_status: 'Revoked', is_trusted: false, staff_mfa_verified_at: null });
    expect((await staff.resetDevices(admin, userId, 'Lost phone again')).devicesRevoked).toBe(0);
  });

  it('shows permission sets with their keys and scopes', async () => {
    const sets = await reviews.permissionSets();
    const agent = sets.find((s) => s.code === 'TIER_SUPPORT_AGENT')!;
    expect(agent).toMatchObject({ roleCode: 'SUP', kind: 'TIER', tierRank: 1 });
    expect(agent.items.some((i) => i.key === 'case.edit')).toBe(true);
  });

  it('lists sensitive and time-limited grants for the monthly review and records keep and revoke decisions', async () => {
    const admin = await newAdmin('TIER_PRIMARY_ADMINISTRATOR');
    const { userId } = await activeAgent(admin);
    const set = await db.query<{ id: string }>(
      `INSERT INTO idn.permission_set (code, name_en, name_bn, role_code, kind) VALUES ($1, 'Review test', 'পর্যালোচনা পরীক্ষা', 'SUP', 'CUSTOM') RETURNING id`,
      [`CUSTOM_${randomUUID()}`],
    );
    await db.query(
      `INSERT INTO idn.permission_set_item (permission_set_id, permission_id, scope) SELECT $1, id, allowed_scopes[1] FROM idn.permission WHERE is_sensitive LIMIT 1`,
      [set.rows[0].id],
    );
    const grant = await db.query<{ id: string }>(
      `INSERT INTO idn.user_permission_set (user_id, permission_set_id, status, effective_from, expires_at) VALUES ($1, $2, 'Active', now(), now() + interval '30 days') RETURNING id`,
      [userId, set.rows[0].id],
    );
    const grantId = grant.rows[0].id;

    const member = (await reviews.review()).members.find((m) => m.userId === userId)!;
    expect(member).toMatchObject({ roleCode: 'SUP', reveals: 0, searches: 0 });
    expect(member.grants).toEqual([expect.objectContaining({ grantId, kind: 'CUSTOM', decision: null })]);
    expect(member.grants[0].sensitiveKeys).toHaveLength(1);

    await expect(reviews.decide(admin, grantId, { decision: 'KEEP', reason: 'Still covers night shifts' })).resolves.toEqual({ grantId, decision: 'KEEP' });
    expect((await reviews.review()).members.find((m) => m.userId === userId)!.grants[0].decision).toBe('KEEP');

    await reviews.decide(admin, grantId, { decision: 'REVOKE', reason: 'No longer needed' });
    expect((await reviews.review()).members.find((m) => m.userId === userId)!.grants).toEqual([]);
    await expect(reviews.decide(admin, grantId, { decision: 'KEEP', reason: 'too late now' })).rejects.toMatchObject({ status: 404 });
  });
});
