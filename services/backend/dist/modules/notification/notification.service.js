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
exports.NotificationService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_service_1 = require("../../platform/db/database.service");
const area_scope_1 = require("../../platform/policy/area-scope");
const identity_public_1 = require("../identity/identity.public");
const read_model_public_1 = require("../identity/read-model.public");
const read_model_public_2 = require("../request/read-model.public");
const notification_types_1 = require("./notification.types");
const schema_1 = require("./schema");
const template_renderer_1 = require("./template.renderer");
const KEEP_ON_CLOSE = ['NTF-EV-09', 'NTF-EV-13', 'NTF-EV-18'];
const REPORT_PAGE = 200;
let NotificationService = class NotificationService {
    db;
    constructor(db) {
        this.db = db;
    }
    async enqueue(tx, input) {
        const eventCode = input.eventCode;
        const [event] = await tx.orm
            .insert(schema_1.notificationEvent)
            .values({
            eventCode, aggregateType: input.aggregateType, aggregateId: input.aggregateId, requestId: input.requestId ?? null, caseId: input.caseId ?? null,
            payload: { urgency: input.urgency ?? null, varsByLang: { bn: this.varsFor(input, 'bn'), en: this.varsFor(input, 'en') } },
            sourceOutboxEventId: input.sourceOutboxEventId ?? null,
        })
            .onConflictDoUpdate({ target: schema_1.notificationEvent.sourceOutboxEventId, set: { updatedAt: (0, drizzle_orm_1.sql) `now()` } })
            .returning({ id: schema_1.notificationEvent.id });
        let created = 0;
        const seen = new Set();
        for (const r of input.recipients) {
            const key = `${r.userId}:${r.role}`;
            if (seen.has(key))
                continue;
            seen.add(key);
            const [rule] = await tx.orm
                .select({ channels: schema_1.notificationRule.channels, isCritical: schema_1.notificationRule.isCritical })
                .from(schema_1.notificationRule)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notificationRule.eventCode, eventCode), (0, drizzle_orm_1.eq)(schema_1.notificationRule.recipientRole, r.role), (0, drizzle_orm_1.eq)(schema_1.notificationRule.enabled, true)));
            if (!rule)
                continue;
            const lang = await (0, read_model_public_1.preferredLanguage)(tx, r.userId);
            if (!lang)
                continue;
            const vars = this.varsFor(input, lang);
            const critical = rule.isCritical || (input.eventCode === 'NTF-EV-04' && input.urgency === 'Critical');
            for (const channel of rule.channels.filter((c) => c !== 'SMS')) {
                const text = await this.template(tx, eventCode, channel, lang);
                if (!text)
                    continue;
                const inserted = await tx.orm
                    .insert(schema_1.notification)
                    .values({
                    notificationEventId: event.id, recipientUserId: r.userId, channel, templateVersionId: text.id, language: lang,
                    requestId: input.requestId ?? null, caseId: input.caseId ?? null, invitationId: input.invitationId ?? null,
                    dedupeKey: `${input.dedupeBase}:${r.userId}:${channel}`, isCritical: critical,
                    renderedTitle: text.title ? (0, template_renderer_1.render)(text.title, vars) : null, renderedBody: (0, template_renderer_1.render)(text.body, vars), scheduledFor: input.scheduledFor ?? new Date(),
                })
                    .onConflictDoNothing({ target: schema_1.notification.dedupeKey })
                    .returning({ id: schema_1.notification.id });
                created += inserted.length;
            }
        }
        await tx.orm
            .update(schema_1.notificationEvent)
            .set({ status: created > 0 ? 'Processed' : 'Skipped', updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.eq)(schema_1.notificationEvent.id, event.id));
        return created;
    }
    async cancelForRequest(tx, requestId, reason = 'REQUEST_CLOSED') {
        const cancellable = tx.orm.select({ id: schema_1.notificationEvent.id }).from(schema_1.notificationEvent).where((0, drizzle_orm_1.notInArray)(schema_1.notificationEvent.eventCode, KEEP_ON_CLOSE));
        const rows = await tx.orm
            .update(schema_1.notification)
            .set({ status: 'Cancelled', cancelReason: reason, cancelledAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.notification.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notification.requestId, requestId), (0, drizzle_orm_1.inArray)(schema_1.notification.status, ['Pending', 'Queued']), (0, drizzle_orm_1.inArray)(schema_1.notification.notificationEventId, cancellable)))
            .returning({ id: schema_1.notification.id });
        return rows.length;
    }
    async inbox(principal, opts = {}) {
        const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
        const rows = await this.db.orm
            .select({
            id: schema_1.notification.id, eventCode: schema_1.notificationEvent.eventCode, title: schema_1.notification.renderedTitle, body: schema_1.notification.renderedBody,
            createdAt: schema_1.notification.createdAt, readAt: schema_1.notification.readAt, requestId: schema_1.notification.requestId, invitationId: schema_1.notification.invitationId, critical: schema_1.notification.isCritical,
        })
            .from(schema_1.notification)
            .innerJoin(schema_1.notificationEvent, (0, drizzle_orm_1.eq)(schema_1.notificationEvent.id, schema_1.notification.notificationEventId))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notification.recipientUserId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.notification.channel, 'IN_APP'), (0, drizzle_orm_1.inArray)(schema_1.notification.status, ['Delivered', 'Read']), opts.unreadOnly ? (0, drizzle_orm_1.isNull)(schema_1.notification.readAt) : undefined))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.notification.createdAt))
            .limit(limit);
        return rows.map(({ readAt, ...r }) => ({
            id: r.id, eventCode: r.eventCode, category: (0, notification_types_1.categoryOf)(r.eventCode), title: r.title, body: r.body, createdAt: r.createdAt, read: readAt !== null,
            requestId: r.requestId, invitationId: r.invitationId, critical: r.critical,
        }));
    }
    async unreadCount(principal) {
        const [row] = await this.db.orm
            .select({ n: (0, drizzle_orm_1.count)() })
            .from(schema_1.notification)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notification.recipientUserId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.notification.channel, 'IN_APP'), (0, drizzle_orm_1.eq)(schema_1.notification.status, 'Delivered'), (0, drizzle_orm_1.isNull)(schema_1.notification.readAt)));
        return { unread: row.n };
    }
    async markRead(principal, id) {
        const rows = await this.db.orm
            .update(schema_1.notification)
            .set({
            status: 'Read', readAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.notification.readAt}, now())`, deliveredAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.notification.deliveredAt}, now())`,
            version: (0, drizzle_orm_1.sql) `${schema_1.notification.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()`,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notification.id, id), (0, drizzle_orm_1.eq)(schema_1.notification.recipientUserId, principal.userId), (0, drizzle_orm_1.inArray)(schema_1.notification.status, ['Sent', 'Delivered', 'Read'])))
            .returning({ eventId: schema_1.notification.notificationEventId });
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
        await this.markCompanionsRead(id, rows[0].eventId, principal.userId);
        return { id, read: true };
    }
    async markAllRead(principal) {
        const rows = await this.db.orm
            .update(schema_1.notification)
            .set({ status: 'Read', readAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.notification.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notification.recipientUserId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.notification.channel, 'IN_APP'), (0, drizzle_orm_1.eq)(schema_1.notification.status, 'Delivered')))
            .returning({ id: schema_1.notification.id });
        return { updated: rows.length };
    }
    async receipt(principal, id) {
        const rows = await this.db.orm
            .update(schema_1.notification)
            .set({
            status: (0, drizzle_orm_1.sql) `CASE WHEN ${schema_1.notification.status} = 'Sent' THEN 'Delivered'::notification_status ELSE ${schema_1.notification.status} END`,
            deliveredAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.notification.deliveredAt}, now())`, updatedAt: (0, drizzle_orm_1.sql) `now()`,
        })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notification.id, id), (0, drizzle_orm_1.eq)(schema_1.notification.recipientUserId, principal.userId), (0, drizzle_orm_1.eq)(schema_1.notification.channel, 'PUSH'), (0, drizzle_orm_1.inArray)(schema_1.notification.status, ['Sent', 'Delivered', 'Read'])))
            .returning({ id: schema_1.notification.id });
        if (!rows[0])
            throw new common_1.NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
        return { id, delivered: true };
    }
    async registerPushToken(principal, installId, token) {
        if (!(await (0, identity_public_1.setPushToken)(this.db, principal.userId, installId, token)))
            throw new common_1.NotFoundException({ code: 'DEVICE_NOT_FOUND' });
        return { registered: true };
    }
    async deliveryReport(principal, scope, days = 7) {
        const areas = scope === 'Area' ? new Set(await (0, area_scope_1.staffAreaIds)(this.db, principal.userId)) : null;
        if (areas && areas.size === 0)
            throw new common_1.HttpException({ code: 'FORBIDDEN' }, common_1.HttpStatus.FORBIDDEN);
        const report = [];
        for (let offset = 0; report.length < REPORT_PAGE; offset += REPORT_PAGE) {
            const rows = await this.db.orm
                .select({
                id: schema_1.notification.id, eventCode: schema_1.notificationEvent.eventCode, channel: schema_1.notification.channel, status: schema_1.notification.status, critical: schema_1.notification.isCritical,
                requestId: schema_1.notification.requestId, failedAt: schema_1.notification.failedAt,
                attempts: (0, drizzle_orm_1.sql) `(SELECT count(*)::int FROM ${schema_1.deliveryAttempt} WHERE ${schema_1.deliveryAttempt.notificationId} = ${schema_1.notification.id})`,
            })
                .from(schema_1.notification)
                .innerJoin(schema_1.notificationEvent, (0, drizzle_orm_1.eq)(schema_1.notificationEvent.id, schema_1.notification.notificationEventId))
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.inArray)(schema_1.notification.status, ['Failed', 'Suppressed']), (0, drizzle_orm_1.sql) `${schema_1.notification.updatedAt} > now() - make_interval(days => ${days}::int)`, areas ? (0, drizzle_orm_1.isNotNull)(schema_1.notification.requestId) : undefined))
                .orderBy((0, drizzle_orm_1.desc)(schema_1.notification.isCritical), (0, drizzle_orm_1.desc)(schema_1.notification.updatedAt), (0, drizzle_orm_1.desc)(schema_1.notification.id))
                .limit(REPORT_PAGE)
                .offset(offset);
            const routing = await (0, read_model_public_2.requestRouting)(this.db, rows.flatMap((r) => (r.requestId ? [r.requestId] : [])));
            for (const r of rows) {
                const request = r.requestId ? routing.get(r.requestId) : undefined;
                if (areas && !(request?.areaId && areas.has(request.areaId)))
                    continue;
                if (report.length < REPORT_PAGE)
                    report.push({ ...r, requestReference: request?.referenceNo ?? null });
            }
            if (!areas || rows.length < REPORT_PAGE)
                break;
        }
        return report;
    }
    async markCompanionsRead(id, eventId, userId) {
        await this.db.orm
            .update(schema_1.notification)
            .set({ readAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.notification.readAt}, now())`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notification.notificationEventId, eventId), (0, drizzle_orm_1.eq)(schema_1.notification.recipientUserId, userId), (0, drizzle_orm_1.ne)(schema_1.notification.id, id)));
    }
    varsFor(input, lang) {
        return typeof input.vars === 'function' ? input.vars(lang) : input.vars;
    }
    async template(db, eventCode, channel, lang) {
        const [row] = await db.orm
            .select({ id: schema_1.templateVersion.id, title: schema_1.templateVersion.title, body: schema_1.templateVersion.body })
            .from(schema_1.notificationTemplate)
            .innerJoin(schema_1.templateVersion, (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.templateVersion.templateId, schema_1.notificationTemplate.id), (0, drizzle_orm_1.eq)(schema_1.templateVersion.status, 'Approved')))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notificationTemplate.eventCode, eventCode), (0, drizzle_orm_1.eq)(schema_1.notificationTemplate.channel, channel), (0, drizzle_orm_1.eq)(schema_1.notificationTemplate.status, 'Active')))
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `${schema_1.templateVersion.language} = ${lang}`))
            .limit(1);
        return row ?? null;
    }
};
exports.NotificationService = NotificationService;
exports.NotificationService = NotificationService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], NotificationService);
//# sourceMappingURL=notification.service.js.map