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
exports.AccessReviewService = void 0;
exports.monthWindow = monthWindow;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../../platform/audit/audit.service");
const database_service_1 = require("../../platform/db/database.service");
const outbox_service_1 = require("../../platform/outbox/outbox.service");
const read_model_public_1 = require("../matching/read-model.public");
const schema_1 = require("./schema");
const staff_service_1 = require("./staff.service");
const DHAKA_OFFSET_MS = 6 * 3_600_000;
const REVIEWED_KINDS = ['SCOPE', 'CUSTOM'];
function monthWindow(month, now = new Date()) {
    const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
    const [y, m] = month ? month.split('-').map(Number) : [local.getUTCFullYear(), local.getUTCMonth() + 1];
    const from = new Date(Date.UTC(y, m - 1, 1) - DHAKA_OFFSET_MS);
    const to = new Date(Date.UTC(y, m, 1) - DHAKA_OFFSET_MS);
    return { month: `${y}-${String(m).padStart(2, '0')}`, from, to };
}
let AccessReviewService = class AccessReviewService {
    db;
    staff;
    outbox;
    audit;
    constructor(db, staff, outbox, audit) {
        this.db = db;
        this.staff = staff;
        this.outbox = outbox;
        this.audit = audit;
    }
    async permissionSets() {
        const rows = await this.db.orm
            .select({
            setId: schema_1.permissionSet.id, code: schema_1.permissionSet.code, nameEn: schema_1.permissionSet.nameEn, nameBn: schema_1.permissionSet.nameBn, roleCode: schema_1.permissionSet.roleCode,
            kind: schema_1.permissionSet.kind, tierRank: schema_1.permissionSet.tierRank, key: schema_1.permission.key, scope: schema_1.permissionSetItem.scope, descriptionEn: schema_1.permission.descriptionEn,
            descriptionBn: schema_1.permission.descriptionBn, sensitive: schema_1.permission.isSensitive, requiresStepUp: schema_1.permission.requiresStepUp,
        })
            .from(schema_1.permissionSet)
            .innerJoin(schema_1.permissionSetItem, (0, drizzle_orm_1.eq)(schema_1.permissionSetItem.permissionSetId, schema_1.permissionSet.id))
            .innerJoin(schema_1.permission, (0, drizzle_orm_1.eq)(schema_1.permission.id, schema_1.permissionSetItem.permissionId))
            .where((0, drizzle_orm_1.eq)(schema_1.permissionSet.status, 'Active'))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.permissionSet.roleCode), (0, drizzle_orm_1.asc)(schema_1.permissionSet.tierRank), (0, drizzle_orm_1.asc)(schema_1.permissionSet.code), (0, drizzle_orm_1.asc)(schema_1.permission.key));
        const sets = new Map();
        for (const r of rows) {
            const set = sets.get(r.setId) ?? { code: r.code, nameEn: r.nameEn, nameBn: r.nameBn, roleCode: r.roleCode, kind: r.kind, tierRank: r.tierRank, items: [] };
            set.items.push({ key: r.key, scope: r.scope, descriptionEn: r.descriptionEn, descriptionBn: r.descriptionBn, sensitive: r.sensitive, requiresStepUp: r.requiresStepUp });
            sets.set(r.setId, set);
        }
        return [...sets.values()];
    }
    async review(month) {
        const window = monthWindow(month);
        const members = (await this.staff.staffList()).filter((s) => s.status !== 'Deactivated');
        const ids = members.map((m) => m.userId);
        if (ids.length === 0)
            return { month: window.month, members: [] };
        const sensitiveKeys = this.db.orm
            .select({ setId: schema_1.permissionSetItem.permissionSetId })
            .from(schema_1.permissionSetItem)
            .innerJoin(schema_1.permission, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permission.id, schema_1.permissionSetItem.permissionId), (0, drizzle_orm_1.eq)(schema_1.permission.isSensitive, true)));
        const grants = await this.db.orm
            .select({
            grantId: schema_1.userPermissionSet.id, userId: schema_1.userPermissionSet.userId, setId: schema_1.permissionSet.id, setCode: schema_1.permissionSet.code, setNameEn: schema_1.permissionSet.nameEn,
            setNameBn: schema_1.permissionSet.nameBn, kind: schema_1.permissionSet.kind, expiresAt: schema_1.userPermissionSet.expiresAt, lastReviewedAt: schema_1.userPermissionSet.lastReviewedAt,
        })
            .from(schema_1.userPermissionSet)
            .innerJoin(schema_1.permissionSet, (0, drizzle_orm_1.eq)(schema_1.permissionSet.id, schema_1.userPermissionSet.permissionSetId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.userPermissionSet.userId, ids), (0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active'), (0, drizzle_orm_1.inArray)(schema_1.permissionSet.kind, [...REVIEWED_KINDS]), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNotNull)(schema_1.userPermissionSet.expiresAt), (0, drizzle_orm_1.inArray)(schema_1.permissionSet.id, sensitiveKeys))));
        const setIds = [...new Set(grants.map((g) => g.setId))];
        const keys = setIds.length
            ? await this.db.orm
                .select({ setId: schema_1.permissionSetItem.permissionSetId, key: schema_1.permission.key })
                .from(schema_1.permissionSetItem)
                .innerJoin(schema_1.permission, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.permission.id, schema_1.permissionSetItem.permissionId), (0, drizzle_orm_1.eq)(schema_1.permission.isSensitive, true)))
                .where((0, drizzle_orm_1.inArray)(schema_1.permissionSetItem.permissionSetId, setIds))
            : [];
        const reveals = await this.db.orm
            .select({ userId: schema_1.sensitiveAccessGrant.granteeUserId, n: (0, drizzle_orm_1.count)() })
            .from(schema_1.sensitiveAccessGrant)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.sensitiveAccessGrant.granteeUserId, ids), (0, drizzle_orm_1.gte)(schema_1.sensitiveAccessGrant.grantedAt, window.from), (0, drizzle_orm_1.lt)(schema_1.sensitiveAccessGrant.grantedAt, window.to)))
            .groupBy(schema_1.sensitiveAccessGrant.granteeUserId);
        const searches = await (0, read_model_public_1.searchCountsByActor)(this.db, ids, window.from, window.to);
        return {
            month: window.month,
            members: members.map((m) => ({
                userId: m.userId, displayName: m.displayName, roleCode: m.roleCode, tierCode: m.tierCode,
                reveals: reveals.find((r) => r.userId === m.userId)?.n ?? 0,
                searches: searches.get(m.userId) ?? 0,
                grants: grants
                    .filter((g) => g.userId === m.userId)
                    .map((g) => ({
                    grantId: g.grantId, setCode: g.setCode, setNameEn: g.setNameEn, setNameBn: g.setNameBn, kind: g.kind, expiresAt: g.expiresAt,
                    sensitiveKeys: keys.filter((k) => k.setId === g.setId).map((k) => k.key),
                    ...(g.lastReviewedAt && g.lastReviewedAt >= window.from && g.lastReviewedAt < window.to
                        ? { decision: 'KEEP', decidedAt: g.lastReviewedAt }
                        : { decision: null, decidedAt: null }),
                })),
            })),
        };
    }
    async decide(principal, grantId, dto) {
        return this.db.transaction(async (tx) => {
            const [grant] = await tx.orm
                .select({ userId: schema_1.userPermissionSet.userId, kind: schema_1.permissionSet.kind })
                .from(schema_1.userPermissionSet)
                .innerJoin(schema_1.permissionSet, (0, drizzle_orm_1.eq)(schema_1.permissionSet.id, schema_1.userPermissionSet.permissionSetId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.id, grantId), (0, drizzle_orm_1.eq)(schema_1.userPermissionSet.status, 'Active'), (0, drizzle_orm_1.inArray)(schema_1.permissionSet.kind, [...REVIEWED_KINDS])))
                .for('update');
            if (!grant)
                throw new common_1.NotFoundException({ code: 'GRANT_NOT_FOUND' });
            await this.staff.assertCanManage(tx, principal.userId, grant.userId);
            if (dto.decision === 'REVOKE') {
                await tx.orm
                    .update(schema_1.userPermissionSet)
                    .set({ status: 'Revoked', revokedBy: principal.userId, revokedAt: new Date(), revokeReason: dto.reason, version: (0, drizzle_orm_1.sql) `${schema_1.userPermissionSet.version} + 1`, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.id, grantId));
                await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: grant.userId, eventType: 'PermissionRevoked', payload: { grantId, by: principal.userId } });
            }
            else {
                await tx.orm
                    .update(schema_1.userPermissionSet)
                    .set({ lastReviewedAt: new Date(), lastReviewedBy: principal.userId, updatedAt: new Date() })
                    .where((0, drizzle_orm_1.eq)(schema_1.userPermissionSet.id, grantId));
            }
            await this.audit.record(tx, {
                category: 'PERMISSION', action: dto.decision === 'REVOKE' ? 'PERMISSION_REVOKED' : 'APPROVE', result: 'SUCCESS', actorUserId: principal.userId,
                actorRole: 'ADM', entityType: 'user_permission_set', entityId: grantId, subjectUserId: grant.userId,
                reasonCode: `ACCESS_REVIEW_${dto.decision}`, reasonText: dto.reason, correlationId: (0, node_crypto_1.randomUUID)(),
            });
            return { grantId, decision: dto.decision };
        });
    }
};
exports.AccessReviewService = AccessReviewService;
exports.AccessReviewService = AccessReviewService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        staff_service_1.StaffService,
        outbox_service_1.OutboxService,
        audit_service_1.AuditService])
], AccessReviewService);
//# sourceMappingURL=access-review.service.js.map