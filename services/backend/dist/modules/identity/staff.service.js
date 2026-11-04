"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../platform/audit/audit.service");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const status_history_service_1 = require("../../platform/status/status-history.service");
const read_model_public_1 = require("../case-workflow/read-model.public");
const phone_1 = require("./phone");
const password_policy_1 = require("./password-policy");
const password_service_1 = require("./password.service");
const schema_1 = require("./schema");
const sms_port_1 = require("./sms.port");
const INVITE_DAYS = 7;
const HASH_PARAMS = { memoryKiB: 19456, timeCost: 2, parallelism: 1 };
const sha = (v) => (0, node_crypto_1.createHash)('sha256').update(v).digest('hex');
const PRIMARY_TIER = 'TIER_PRIMARY_ADMINISTRATOR';
const fail = (code, status = common_1.HttpStatus.UNPROCESSABLE_ENTITY) => new common_1.HttpException({ code }, status);
let StaffService = class StaffService {
    db;
    passwords;
    sms;
    outbox;
    audit;
    history;
    constructor(db, passwords, sms, outbox, audit, history) {
        this.db = db;
        this.passwords = passwords;
        this.sms = sms;
        this.outbox = outbox;
        this.audit = audit;
        this.history = history;
    }
    async invite(principal, dto) {
        const phone = (0, phone_1.normalizeBdPhone)(dto.phone);
        if (!phone)
            throw new common_1.BadRequestException({ code: 'PHONE_INVALID' });
        const token = (0, node_crypto_1.randomBytes)(24).toString('base64url');
        const created = await this.db.transaction(async (tx) => {
            const tier = await this.tier(tx, dto.tierCode, dto.roleCode);
            await this.requireAuthority(tx, principal.userId, tier);
            const areaIds = await this.checkAreas(tx, dto.roleCode, dto.areaIds ?? []);
            const [exists] = await tx.orm.select({ id: schema_1.appUser.id }).from(schema_1.appUser).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.phoneE164, phone), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)));
            if (exists)
                throw new common_1.ConflictException({ code: 'ACCOUNT_EXISTS' });
            await tx.orm
                .update(schema_1.staffInvitation)
                .set({ status: 'Revoked', version: (0, drizzle_orm_1.sql) `${schema_1.staffInvitation.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.staffInvitation.phoneE164, phone), (0, drizzle_orm_1.eq)(schema_1.staffInvitation.status, 'Pending')));
            const [row] = await tx.orm
                .insert(schema_1.staffInvitation)
                .values({
                phoneE164: phone, roleCode: dto.roleCode, invitedBy: principal.userId, tokenHash: sha(token),
                expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000), permissionSetId: tier.id, areaIds,
            })
                .returning({ id: schema_1.staffInvitation.id });
            await this.outbox.append(tx, { aggregateType: 'STAFF_INVITATION', aggregateId: row.id, eventType: 'StaffInvited', payload: { roleCode: dto.roleCode, tierCode: tier.code } });
            await this.audit.record(tx, {
                category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM',
                entityType: 'staff_invitation', entityId: row.id, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return row.id;
        });
        await this.sms.send(phone, `BBDA staff invitation. Use this code to set up your account: ${token}. It is valid for ${INVITE_DAYS} days.`);
        return { id: created, expiresInDays: INVITE_DAYS };
    }
    async list(principal) {
        void principal;
        return this.db.orm
            .select({
            id: schema_1.staffInvitation.id, phoneLast4: (0, drizzle_orm_1.sql) `right(${schema_1.staffInvitation.phoneE164}, 4)`, roleCode: schema_1.staffInvitation.roleCode, tierCode: schema_1.permissionSet.code,
            areaIds: schema_1.staffInvitation.areaIds, status: schema_1.staffInvitation.status, expiresAt: schema_1.staffInvitation.expiresAt, createdAt: schema_1.staffInvitation.createdAt, acceptedAt: schema_1.staffInvitation.acceptedAt,
        })
            .from(schema_1.staffInvitation)
            .leftJoin(schema_1.permissionSet, (0, drizzle_orm_1.eq)(schema_1.permissionSet.id, schema_1.staffInvitation.permissionSetId))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.staffInvitation.createdAt))
            .limit(200);
    }
    async revoke(principal, id) {
        return this.db.transaction(async (tx) => {
            const res = await tx.orm
                .update(schema_1.staffInvitation)
                .set({ status: 'Revoked', version: (0, drizzle_orm_1.sql) `${schema_1.staffInvitation.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.staffInvitation.id, id), (0, drizzle_orm_1.eq)(schema_1.staffInvitation.status, 'Pending')));
            if (!res.rowCount)
                throw new common_1.NotFoundException({ code: 'INVITATION_NOT_FOUND' });
            await this.outbox.append(tx, { aggregateType: 'STAFF_INVITATION', aggregateId: id, eventType: 'StaffInvitationRevoked', payload: { by: principal.userId } });
            return { id, status: 'Revoked' };
        });
    }
    async accept(dto) {
        return this.db.transaction(async (tx) => {
            const [inv] = await tx.orm
                .select({
                id: schema_1.staffInvitation.id, phone: schema_1.staffInvitation.phoneE164, roleCode: schema_1.staffInvitation.roleCode, invitedBy: schema_1.staffInvitation.invitedBy,
                permissionSetId: schema_1.staffInvitation.permissionSetId, areaIds: schema_1.staffInvitation.areaIds, expiresAt: schema_1.staffInvitation.expiresAt, status: schema_1.staffInvitation.status,
            })
                .from(schema_1.staffInvitation)
                .where((0, drizzle_orm_1.eq)(schema_1.staffInvitation.tokenHash, sha(dto.token)))
                .for('update');
            if (!inv || inv.status !== 'Pending')
                throw new common_1.NotFoundException({ code: 'INVITATION_INVALID' });
            if (inv.expiresAt.getTime() <= Date.now()) {
                await tx.orm.update(schema_1.staffInvitation).set({ status: 'Expired', version: (0, drizzle_orm_1.sql) `${schema_1.staffInvitation.version} + 1`, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(schema_1.staffInvitation.id, inv.id));
                throw fail('INVITATION_EXPIRED', common_1.HttpStatus.GONE);
            }
            const problems = (0, password_policy_1.checkPassword)(dto.password, inv.phone, true);
            if (problems.length)
                throw new common_1.BadRequestException({ code: 'PASSWORD_REJECTED', problems });
            const [exists] = await tx.orm.select({ id: schema_1.appUser.id }).from(schema_1.appUser).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.phoneE164, inv.phone), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)));
            if (exists)
                throw new common_1.ConflictException({ code: 'ACCOUNT_EXISTS' });
            const hash = await this.passwords.hash(dto.password);
            const [user] = await tx.orm
                .insert(schema_1.appUser)
                .values({ phoneE164: inv.phone, phoneVerifiedAt: new Date(), isStaff: true, preferredLanguage: dto.language })
                .returning({ id: schema_1.appUser.id });
            const userId = user.id;
            await tx.orm.insert(schema_1.credential).values({ userId, passwordHash: hash, hashAlgorithm: 'ARGON2ID', hashParams: HASH_PARAMS, passwordSetAt: new Date() });
            const [roleRow] = await tx.orm.select({ id: schema_1.role.id }).from(schema_1.role).where((0, drizzle_orm_1.eq)(schema_1.role.code, inv.roleCode));
            const [assigned] = await tx.orm
                .insert(schema_1.userRole)
                .values({ userId, roleId: roleRow.id, status: 'Active', assignedBy: inv.invitedBy, assignedAt: new Date() })
                .returning({ id: schema_1.userRole.id });
            if (!inv.permissionSetId)
                throw fail('INVITATION_INVALID', common_1.HttpStatus.NOT_FOUND);
            await this.applyAssignment(tx, userId, assigned.id, inv.permissionSetId, inv.areaIds, inv.invitedBy);
            await tx.orm
                .update(schema_1.staffInvitation)
                .set({ status: 'Accepted', acceptedUserId: userId, acceptedAt: new Date(), version: (0, drizzle_orm_1.sql) `${schema_1.staffInvitation.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.eq)(schema_1.staffInvitation.id, inv.id));
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'StaffActivated', payload: { roleCode: inv.roleCode } });
            await this.audit.record(tx, {
                category: 'DATA_CHANGE', action: 'CREATE', result: 'SUCCESS', actorUserId: userId, actorRole: inv.roleCode,
                entityType: 'app_user', entityId: userId, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return { userId, roleCode: inv.roleCode };
        });
    }
    async changeAssignment(principal, userId, dto) {
        return this.db.transaction(async (tx) => {
            if (userId === principal.userId)
                throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
            const [t] = await tx.orm
                .select({ roleId: schema_1.role.id, userRoleId: schema_1.userRole.id, roleCode: schema_1.role.code })
                .from(schema_1.appUser)
                .innerJoin(schema_1.userRole, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRole.userId, schema_1.appUser.id), (0, drizzle_orm_1.eq)(schema_1.userRole.status, 'Active')))
                .innerJoin(schema_1.role, (0, drizzle_orm_1.eq)(schema_1.role.id, schema_1.userRole.roleId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.id, userId), (0, drizzle_orm_1.eq)(schema_1.appUser.isStaff, true), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt), (0, drizzle_orm_1.inArray)(schema_1.role.code, ['SUP', 'MOD', 'ADM'])))
                .for('update');
            if (!t)
                throw new common_1.NotFoundException({ code: 'STAFF_NOT_FOUND' });
            const tier = await this.tier(tx, dto.tierCode, t.roleCode);
            await this.requireAuthority(tx, principal.userId, tier);
            await this.guardTarget(tx, principal.userId, userId, tier);
            const areaIds = await this.checkAreas(tx, t.roleCode, dto.areaIds ?? []);
            const tierSets = tx.orm.select({ id: schema_1.permissionSet.id }).from(schema_1.permissionSet).where((0, drizzle_orm_1.eq)(schema_1.permissionSet.kind, 'TIER'));
            await tx.orm
                .update(schema_1.userPermissionSet)
                .set({ status: 'Revoked', revokedBy: principal.userId, revokedAt: new Date(), revokeReason: dto.reason, version: (0, drizzle_orm_1.sql) `${schema_1.userPermissionSet.version} + 1`, updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active'), (0, drizzle_orm_1.inArray)(schema_1.userPermissionSet.permissionSetId, tierSets)));
            await tx.orm.update(schema_1.permissionScope).set({ revokedAt: new Date(), updatedAt: new Date() }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionScope.userRoleId, t.userRoleId), (0, drizzle_orm_1.isNull)(schema_1.permissionScope.revokedAt)));
            await this.applyAssignment(tx, userId, t.userRoleId, tier.id, areaIds, principal.userId);
            await tx.orm
                .update(schema_1.session)
                .set({ revokedAt: new Date(), revokeReason: 'ROLE_CHANGED', updatedAt: new Date() })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.userId, userId), (0, drizzle_orm_1.isNull)(schema_1.session.revokedAt)));
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'StaffAssignmentChanged', payload: { tierCode: tier.code, by: principal.userId } });
            await this.audit.record(tx, {
                category: 'PERMISSION', action: 'ASSIGN', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM', entityType: 'app_user', entityId: userId,
                reasonCode: 'ROLE_ASSIGNMENT', reasonText: dto.reason, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return { userId, tierCode: tier.code, areaIds };
        });
    }
    async staffList() {
        const users = await this.db.orm
            .select({ userId: schema_1.appUser.id, displayName: schema_1.appUser.displayName, phoneLast4: (0, drizzle_orm_1.sql) `right(${schema_1.appUser.phoneE164}, 4)`, accountStatus: schema_1.appUser.accountStatus, lastLoginAt: schema_1.appUser.lastLoginAt })
            .from(schema_1.appUser)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.isStaff, true), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.appUser.createdAt))
            .limit(500);
        const ids = users.map((u) => u.userId);
        if (ids.length === 0)
            return [];
        const roles = await this.db.orm
            .select({ userId: schema_1.userRole.userId, userRoleId: schema_1.userRole.id, roleCode: schema_1.role.code, status: schema_1.userRole.status })
            .from(schema_1.userRole)
            .innerJoin(schema_1.role, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.role.id, schema_1.userRole.roleId), (0, drizzle_orm_1.eq)(schema_1.role.isStaff, true)))
            .where((0, drizzle_orm_1.inArray)(schema_1.userRole.userId, ids))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.userRole.assignedAt));
        const tiers = await this.db.orm
            .select({ userId: schema_1.userPermissionSet.userId, code: schema_1.permissionSet.code })
            .from(schema_1.userPermissionSet)
            .innerJoin(schema_1.permissionSet, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionSet.id, schema_1.userPermissionSet.permissionSetId), (0, drizzle_orm_1.eq)(schema_1.permissionSet.kind, 'TIER')))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.userPermissionSet.userId, ids), (0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active')));
        const activeRoleIds = roles.filter((r) => r.status === 'Active').map((r) => r.userRoleId);
        const scopes = activeRoleIds.length
            ? await this.db.orm
                .select({ userRoleId: schema_1.permissionScope.userRoleId, areaId: schema_1.permissionScope.areaId })
                .from(schema_1.permissionScope)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.permissionScope.userRoleId, activeRoleIds), (0, drizzle_orm_1.isNull)(schema_1.permissionScope.revokedAt)))
            : [];
        return users.map((u) => {
            const current = roles.find((r) => r.userId === u.userId && r.status === 'Active') ?? roles.find((r) => r.userId === u.userId);
            const active = current?.status === 'Active';
            return {
                userId: u.userId, displayName: u.displayName, phoneLast4: u.phoneLast4, roleCode: current?.roleCode ?? null,
                tierCode: active ? (tiers.find((t) => t.userId === u.userId)?.code ?? null) : null,
                areaIds: active ? scopes.filter((s) => s.userRoleId === current.userRoleId && s.areaId).map((s) => s.areaId) : [],
                status: !active ? 'Deactivated' : u.accountStatus === 'Active' ? 'Active' : u.accountStatus === 'Locked' ? 'Locked' : 'Suspended',
                lastLoginAt: u.lastLoginAt,
            };
        });
    }
    async deactivate(principal, userId, reason) {
        return this.db.transaction(async (tx) => {
            if (userId === principal.userId)
                throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
            const t = await this.lockStaffRole(tx, userId);
            await this.guardTarget(tx, principal.userId, userId, null);
            const now = new Date();
            const tierSets = tx.orm.select({ id: schema_1.permissionSet.id }).from(schema_1.permissionSet).where((0, drizzle_orm_1.eq)(schema_1.permissionSet.kind, 'TIER'));
            await tx.orm
                .update(schema_1.userPermissionSet)
                .set({ status: 'Revoked', revokedBy: principal.userId, revokedAt: now, revokeReason: reason, version: (0, drizzle_orm_1.sql) `${schema_1.userPermissionSet.version} + 1`, updatedAt: now })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active'), (0, drizzle_orm_1.inArray)(schema_1.userPermissionSet.permissionSetId, tierSets)));
            await tx.orm.update(schema_1.permissionScope).set({ revokedAt: now, updatedAt: now }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionScope.userRoleId, t.userRoleId), (0, drizzle_orm_1.isNull)(schema_1.permissionScope.revokedAt)));
            await tx.orm
                .update(schema_1.userRole)
                .set({ status: 'Revoked', revokedBy: principal.userId, revokedAt: now, reason, version: (0, drizzle_orm_1.sql) `${schema_1.userRole.version} + 1`, updatedAt: now })
                .where((0, drizzle_orm_1.eq)(schema_1.userRole.id, t.userRoleId));
            await this.history.record(tx, {
                entityType: 'USER_ROLE', entityId: t.userRoleId, from: 'Active', to: 'Revoked', actorUserId: principal.userId, actorRole: 'ADM', source: 'USER',
                reasonCode: 'STAFF_DEACTIVATED', reason, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            await this.revokeAccess(tx, userId, 'ADMIN');
            await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: userId, eventType: 'StaffDeactivated', payload: { roleCode: t.roleCode, by: principal.userId } });
            await this.audit.record(tx, {
                category: 'PERMISSION', action: 'PERMISSION_REVOKED', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM', entityType: 'app_user', entityId: userId,
                reasonCode: 'STAFF_DEACTIVATED', reasonText: reason, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return { userId, status: 'Deactivated', openCases: await (0, read_model_public_1.openCasesOwnedBy)(tx, userId) };
        });
    }
    async resetDevices(principal, userId, reason) {
        return this.db.transaction(async (tx) => {
            if (userId === principal.userId)
                throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
            await this.lockStaffRole(tx, userId);
            await this.guardTarget(tx, principal.userId, userId, await this.currentTier(tx, userId));
            const devicesRevoked = await this.revokeAccess(tx, userId, 'DEVICE_REVOKED');
            await this.audit.record(tx, {
                category: 'AUTH', action: 'SESSIONS_REVOKED', result: 'SUCCESS', actorUserId: principal.userId, actorRole: 'ADM', entityType: 'app_user', entityId: userId,
                reasonCode: 'DEVICE_RESET', reasonText: reason, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return { userId, devicesRevoked };
        });
    }
    async assertCanManage(tx, grantorId, targetUserId) {
        if (targetUserId === grantorId)
            throw fail('CANNOT_CHANGE_OWN_ASSIGNMENT');
        await this.lockStaffRole(tx, targetUserId);
        await this.guardTarget(tx, grantorId, targetUserId, await this.currentTier(tx, targetUserId));
    }
    async lockStaffRole(tx, userId) {
        const [t] = await tx.orm
            .select({ userRoleId: schema_1.userRole.id, roleCode: schema_1.role.code })
            .from(schema_1.appUser)
            .innerJoin(schema_1.userRole, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userRole.userId, schema_1.appUser.id), (0, drizzle_orm_1.eq)(schema_1.userRole.status, 'Active')))
            .innerJoin(schema_1.role, (0, drizzle_orm_1.eq)(schema_1.role.id, schema_1.userRole.roleId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.id, userId), (0, drizzle_orm_1.eq)(schema_1.appUser.isStaff, true), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt), (0, drizzle_orm_1.inArray)(schema_1.role.code, ['SUP', 'MOD', 'ADM'])))
            .for('update');
        if (!t)
            throw new common_1.NotFoundException({ code: 'STAFF_NOT_FOUND' });
        return t;
    }
    async revokeAccess(tx, userId, reason) {
        const now = new Date();
        const devices = await tx.orm
            .update(schema_1.device)
            .set({ signOutStatus: 'Revoked', revokedAt: now, staffMfaVerifiedAt: null, isTrusted: false, updatedAt: now })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.device.userId, userId), (0, drizzle_orm_1.ne)(schema_1.device.signOutStatus, 'Revoked')))
            .returning({ id: schema_1.device.id });
        await tx.orm.update(schema_1.session).set({ revokedAt: now, revokeReason: reason, updatedAt: now }).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.session.userId, userId), (0, drizzle_orm_1.isNull)(schema_1.session.revokedAt)));
        return devices.length;
    }
    async currentTier(tx, userId) {
        const [row] = await tx.orm
            .select({ id: schema_1.permissionSet.id, code: schema_1.permissionSet.code, roleCode: schema_1.permissionSet.roleCode, tierRank: schema_1.permissionSet.tierRank })
            .from(schema_1.userPermissionSet)
            .innerJoin(schema_1.permissionSet, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionSet.id, schema_1.userPermissionSet.permissionSetId), (0, drizzle_orm_1.eq)(schema_1.permissionSet.kind, 'TIER')))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.userId, userId), (0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active')));
        return row ?? null;
    }
    async guardTarget(tx, grantorId, targetUserId, next) {
        const current = await this.currentTier(tx, targetUserId);
        if (current?.roleCode === 'ADM')
            await this.requireAuthority(tx, grantorId, current);
        if (current?.code === PRIMARY_TIER && next?.code !== PRIMARY_TIER && (await this.otherPrimaryAdministrators(tx, targetUserId)) === 0) {
            throw fail('LAST_PRIMARY_ADMINISTRATOR', common_1.HttpStatus.CONFLICT);
        }
    }
    async otherPrimaryAdministrators(tx, exceptUserId) {
        const [row] = await tx.orm
            .select({ n: (0, drizzle_orm_1.count)() })
            .from(schema_1.userPermissionSet)
            .innerJoin(schema_1.permissionSet, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionSet.id, schema_1.userPermissionSet.permissionSetId), (0, drizzle_orm_1.eq)(schema_1.permissionSet.code, PRIMARY_TIER)))
            .innerJoin(schema_1.appUser, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.appUser.id, schema_1.userPermissionSet.userId), (0, drizzle_orm_1.eq)(schema_1.appUser.accountStatus, 'Active'), (0, drizzle_orm_1.isNull)(schema_1.appUser.deletedAt)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active'), (0, drizzle_orm_1.ne)(schema_1.userPermissionSet.userId, exceptUserId), (0, drizzle_orm_1.sql) `(${schema_1.userPermissionSet.expiresAt} is null or ${schema_1.userPermissionSet.expiresAt} > now())`));
        return row.n;
    }
    async applyAssignment(tx, userId, userRoleId, tierId, areaIds, grantedBy) {
        await tx.orm.insert(schema_1.userPermissionSet).values({ userId, permissionSetId: tierId, status: 'Active', grantedBy, effectiveFrom: new Date() });
        if (areaIds.length) {
            await tx.orm.insert(schema_1.permissionScope).values(areaIds.map((areaId) => ({ userRoleId, scopeCode: 'scope.area', areaId, grantedBy })));
        }
    }
    async tier(tx, code, roleCode) {
        const [row] = await tx.orm
            .select({ id: schema_1.permissionSet.id, code: schema_1.permissionSet.code, roleCode: schema_1.permissionSet.roleCode, tierRank: schema_1.permissionSet.tierRank })
            .from(schema_1.permissionSet)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionSet.code, code), (0, drizzle_orm_1.eq)(schema_1.permissionSet.kind, 'TIER'), (0, drizzle_orm_1.eq)(schema_1.permissionSet.status, 'Active'), (0, drizzle_orm_1.eq)(schema_1.permissionSet.roleCode, roleCode)));
        if (!row)
            throw fail('TIER_NOT_FOUND', common_1.HttpStatus.NOT_FOUND);
        return row;
    }
    async requireAuthority(tx, grantorId, tier) {
        if (tier.roleCode !== 'ADM')
            return;
        const [row] = await tx.orm
            .select({ id: schema_1.userPermissionSet.id })
            .from(schema_1.userPermissionSet)
            .innerJoin(schema_1.permissionSet, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permissionSet.id, schema_1.userPermissionSet.permissionSetId), (0, drizzle_orm_1.eq)(schema_1.permissionSet.code, PRIMARY_TIER)))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.userId, grantorId), (0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active'), (0, drizzle_orm_1.sql) `${schema_1.userPermissionSet.effectiveFrom} <= now()`, (0, drizzle_orm_1.sql) `(${schema_1.userPermissionSet.expiresAt} is null or ${schema_1.userPermissionSet.expiresAt} > now())`))
            .limit(1);
        if (!row)
            throw new common_1.HttpException({ code: 'TIER_ABOVE_GRANTOR' }, common_1.HttpStatus.FORBIDDEN);
    }
    async checkAreas(tx, roleCode, areaIds) {
        const unique = [...new Set(areaIds)];
        if (roleCode === 'SUP' && unique.length === 0)
            throw fail('AREA_REQUIRED');
        if (unique.length === 0)
            return [];
        const found = await tx.query('SELECT id FROM cfg.area WHERE id = ANY($1::uuid[]) AND is_active', [unique]);
        if (found.rows.length !== unique.length)
            throw fail('AREA_NOT_FOUND', common_1.HttpStatus.NOT_FOUND);
        return unique;
    }
};
exports.StaffService = StaffService;
exports.StaffService = StaffService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        password_service_1.PasswordService,
        sms_port_1.SmsSender,
        outbox_service_1.OutboxService,
        audit_service_1.AuditService,
        status_history_service_1.StatusHistoryService])
], StaffService);
//# sourceMappingURL=staff.service.js.map