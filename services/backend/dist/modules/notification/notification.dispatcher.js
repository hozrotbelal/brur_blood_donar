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
exports.NotificationDispatcher = void 0;
exports.quietUntil = quietUntil;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_service_1 = require("../../platform/db/database.service");
const read_model_public_1 = require("../case-workflow/read-model.public");
const read_model_public_2 = require("../identity/read-model.public");
const read_model_public_3 = require("../request/read-model.public");
const notification_service_1 = require("./notification.service");
const notification_types_1 = require("./notification.types");
const gateway_ports_1 = require("./gateway.ports");
const schema_1 = require("./schema");
const DHAKA_OFFSET_MIN = 6 * 60;
function minutesOfDay(d) {
    const local = new Date(d.getTime() + DHAKA_OFFSET_MIN * 60_000);
    return local.getUTCHours() * 60 + local.getUTCMinutes();
}
function timeToMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}
function quietUntil(now, start, end) {
    const s = timeToMinutes(start);
    const e = timeToMinutes(end);
    const cur = minutesOfDay(now);
    const inside = s <= e ? cur >= s && cur < e : cur >= s || cur < e;
    if (!inside)
        return null;
    const wait = (e - cur + 1440) % 1440 || 1440;
    return new Date(now.getTime() + wait * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds());
}
let NotificationDispatcher = class NotificationDispatcher {
    db;
    notifications;
    push;
    sms;
    logger = new common_1.Logger('NotificationDispatcher');
    constructor(db, notifications, push, sms) {
        this.db = db;
        this.notifications = notifications;
        this.push = push;
        this.sms = sms;
    }
    async dispatchDue(limit = 100) {
        return this.db.transaction(async (tx) => {
            // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
            const { rows } = await tx.query(`SELECT n.id, n.notification_event_id, n.recipient_user_id, n.channel, n.language, n.request_id, n.case_id, n.invitation_id, n.status, n.is_critical,
                n.rendered_title, n.rendered_body, n.scheduled_for, e.event_code::text AS event_code,
                (SELECT role_code FROM (SELECT r.code::text AS role_code FROM idn.user_role ur JOIN idn.role r ON r.id = ur.role_id
                  WHERE ur.user_id = n.recipient_user_id AND ur.status = 'Active'
                    AND EXISTS (SELECT 1 FROM ntf.notification_rule nr WHERE nr.event_code = e.event_code AND nr.recipient_role = r.code) LIMIT 1) x) AS role,
                (SELECT count(*)::int FROM ntf.delivery_attempt a WHERE a.notification_id = n.id) AS attempts
           FROM ntf.notification n JOIN ntf.notification_event e ON e.id = n.notification_event_id
          WHERE n.status IN ('Pending','Queued') AND n.scheduled_for <= now()
          ORDER BY n.is_critical DESC, n.scheduled_for LIMIT $1 FOR UPDATE OF n SKIP LOCKED`, [limit]);
            for (const n of rows)
                await this.process(tx, n);
            return rows.length;
        });
    }
    async fallbackDue(limit = 100) {
        return this.db.transaction(async (tx) => {
            // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
            const { rows } = await tx.query(`SELECT n.id, n.notification_event_id, n.recipient_user_id, n.request_id, n.case_id, n.invitation_id, n.language::text, n.is_critical, e.event_code::text,
                r.urgency::text AS urgency, ur.code::text AS role,
                json_build_object('max_attempts', nr.max_attempts, 'retry_backoff_seconds', nr.retry_backoff_seconds, 'max_sms_per_request_per_day', nr.max_sms_per_request_per_day,
                  'respects_quiet_hours', nr.respects_quiet_hours, 'sms_fallback_allowed', nr.sms_fallback_allowed, 'fallback_after_seconds', nr.fallback_after_seconds) AS rule
           FROM ntf.notification n
           JOIN ntf.notification_event e ON e.id = n.notification_event_id
           LEFT JOIN req.blood_request r ON r.id = n.request_id
           JOIN LATERAL (SELECT ro.code FROM idn.user_role u JOIN idn.role ro ON ro.id = u.role_id WHERE u.user_id = n.recipient_user_id AND u.status = 'Active'
                          AND EXISTS (SELECT 1 FROM ntf.notification_rule x WHERE x.event_code = e.event_code AND x.recipient_role = ro.code) LIMIT 1) ur ON true
           JOIN ntf.notification_rule nr ON nr.event_code = e.event_code AND nr.recipient_role = ur.code
          WHERE n.channel = 'PUSH' AND n.status IN ('Sent','Failed') AND nr.sms_fallback_allowed AND n.read_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM ntf.notification f WHERE f.fallback_of_id = n.id)
            AND NOT EXISTS (SELECT 1 FROM ntf.notification o WHERE o.notification_event_id = n.notification_event_id AND o.recipient_user_id = n.recipient_user_id AND o.read_at IS NOT NULL)
            AND (n.invitation_id IS NULL OR NOT EXISTS (SELECT 1 FROM src.invitation i WHERE i.id = n.invitation_id AND (i.viewed_at IS NOT NULL OR i.responded_at IS NOT NULL OR i.status IN ('Cancelled','Expired','Withdrawn'))))
            AND COALESCE(n.sent_at, n.failed_at) <= now() - make_interval(secs => COALESCE((nr.fallback_after_seconds ->> COALESCE(r.urgency::text, 'Routine'))::int, 900))
          ORDER BY n.is_critical DESC, n.created_at LIMIT $1 FOR UPDATE OF n SKIP LOCKED`, [limit]);
            let created = 0;
            for (const n of rows)
                created += await this.createSmsFallback(tx, n);
            return created;
        });
    }
    async createSmsFallback(tx, n) {
        const t = await this.notifications.template(tx, n.event_code, 'SMS', n.language);
        if (!t)
            return 0;
        const vars = await this.varsFor(tx, n.notification_event_id, n.language);
        const body = t.body.replace(/\{\{(\w+)\}\}/g, (_m, k) => vars[k] ?? '');
        const rows = await tx.orm
            .insert(schema_1.notification)
            .values({
            notificationEventId: n.notification_event_id, recipientUserId: n.recipient_user_id, channel: 'SMS', templateVersionId: t.id, language: n.language,
            requestId: n.request_id, caseId: n.case_id, invitationId: n.invitation_id, fallbackOfId: n.id,
            dedupeKey: `fallback:${n.id}`, isCritical: n.is_critical, renderedBody: body, scheduledFor: (0, drizzle_orm_1.sql) `now()`,
        })
            .onConflictDoNothing()
            .returning({ id: schema_1.notification.id });
        return rows.length;
    }
    async varsFor(tx, eventId, language) {
        const [row] = await tx.orm.select({ payload: schema_1.notificationEvent.payload }).from(schema_1.notificationEvent).where((0, drizzle_orm_1.eq)(schema_1.notificationEvent.id, eventId));
        const payload = row?.payload;
        return payload?.varsByLang?.[language] ?? {};
    }
    async process(tx, n) {
        const rule = await this.rule(tx, n.event_code, n.role);
        const decision = await this.decide(tx, n, rule);
        if (decision.action === 'suppress') {
            await tx.orm
                .update(schema_1.notification)
                .set({ status: 'Suppressed', suppressionReason: decision.reason, version: (0, drizzle_orm_1.sql) `${schema_1.notification.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                .where((0, drizzle_orm_1.eq)(schema_1.notification.id, n.id));
            return;
        }
        if (decision.action === 'defer') {
            await tx.orm.update(schema_1.notification).set({ scheduledFor: decision.until, updatedAt: (0, drizzle_orm_1.sql) `now()` }).where((0, drizzle_orm_1.eq)(schema_1.notification.id, n.id));
            return;
        }
        if (decision.action === 'fail') {
            await this.recordAttempt(tx, n, rule, 'FAILED', decision.code, null, true);
            return;
        }
        try {
            await this.send(tx, n);
        }
        catch (error) {
            this.logger.warn(`send failed for ${n.id}: ${error.message}`);
            await this.recordAttempt(tx, n, rule, 'FAILED', 'SEND_ERROR', null, false);
        }
    }
    async send(tx, n) {
        const attempt = n.attempts + 1;
        if (n.channel === 'IN_APP') {
            await tx.orm.insert(schema_1.deliveryAttempt).values({ notificationId: n.id, attemptNo: attempt, provider: 'IN_APP', result: 'DELIVERED', requestedAt: (0, drizzle_orm_1.sql) `now()`, resultAt: (0, drizzle_orm_1.sql) `now()` });
            await tx.orm
                .update(schema_1.notification)
                .set({ status: 'Delivered', sentAt: (0, drizzle_orm_1.sql) `now()`, deliveredAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.notification.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                .where((0, drizzle_orm_1.eq)(schema_1.notification.id, n.id));
            return;
        }
        let provider = 'SMS_GATEWAY';
        let messageId;
        if (n.channel === 'PUSH') {
            const devices = await (0, read_model_public_2.activePushDevices)(tx, n.recipient_user_id);
            const result = await this.push.send(devices.map((d) => d.pushToken), n.rendered_title ?? '', n.rendered_body ?? '', { notificationId: n.id, ...(n.request_id ? { requestId: n.request_id } : {}) });
            provider = devices[0]?.platform === 'ios' ? 'APNS' : 'FCM';
            messageId = result.messageId;
        }
        else {
            const phone = await (0, read_model_public_2.phoneOf)(tx, n.recipient_user_id);
            messageId = (await this.sms.send(phone, n.rendered_body ?? '')).messageId;
        }
        await tx.orm.insert(schema_1.deliveryAttempt).values({ notificationId: n.id, attemptNo: attempt, provider, providerMessageId: messageId, result: 'ACCEPTED', requestedAt: (0, drizzle_orm_1.sql) `now()`, resultAt: (0, drizzle_orm_1.sql) `now()` });
        await tx.orm
            .update(schema_1.notification)
            .set({ status: 'Sent', sentAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.notification.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.eq)(schema_1.notification.id, n.id));
    }
    async decide(tx, n, rule) {
        const [suppressed] = await tx.orm
            .select({ id: schema_1.suppression.id })
            .from(schema_1.suppression)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.suppression.userId, n.recipient_user_id), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.suppression.channel), (0, drizzle_orm_1.eq)(schema_1.suppression.channel, n.channel)), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.suppression.activeFrom), (0, drizzle_orm_1.lte)(schema_1.suppression.activeFrom, (0, drizzle_orm_1.sql) `now()`)), (0, drizzle_orm_1.or)((0, drizzle_orm_1.isNull)(schema_1.suppression.activeUntil), (0, drizzle_orm_1.gt)(schema_1.suppression.activeUntil, (0, drizzle_orm_1.sql) `now()`))))
            .limit(1);
        if (suppressed)
            return { action: 'suppress', reason: 'RECIPIENT_SUPPRESSED' };
        const p = await (0, read_model_public_2.channelPreference)(tx, n.recipient_user_id, (0, notification_types_1.categoryOf)(n.event_code));
        if (p) {
            if (n.channel === 'PUSH' && !p.pushEnabled)
                return { action: 'suppress', reason: 'PREFERENCE_OFF' };
            if (n.channel === 'IN_APP' && !p.inappEnabled)
                return { action: 'suppress', reason: 'PREFERENCE_OFF' };
            if (n.channel === 'SMS' && !p.smsEnabled)
                return { action: 'suppress', reason: 'PREFERENCE_OFF' };
        }
        if (n.channel !== 'IN_APP' && rule?.respectsQuietHours && !n.is_critical && p?.quietStart && p.quietEnd) {
            const until = quietUntil(new Date(), p.quietStart, p.quietEnd);
            if (until)
                return { action: 'defer', until };
        }
        if (n.channel === 'PUSH' && (await (0, read_model_public_2.activePushDevices)(tx, n.recipient_user_id)).length === 0)
            return { action: 'fail', code: 'NO_PUSH_TOKEN' };
        if (n.channel === 'SMS') {
            if (!(await (0, read_model_public_2.hasSmsChannelConsent)(tx, n.recipient_user_id)))
                return { action: 'suppress', reason: 'NO_CONSENT' };
            const cap = rule?.maxSmsPerRequestPerDay ?? 2;
            const [sent] = await tx.orm
                .select({ n: (0, drizzle_orm_1.count)() })
                .from(schema_1.notification)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notification.recipientUserId, n.recipient_user_id), (0, drizzle_orm_1.eq)(schema_1.notification.channel, 'SMS'), (0, drizzle_orm_1.sql) `${schema_1.notification.requestId} IS NOT DISTINCT FROM ${n.request_id}`, (0, drizzle_orm_1.inArray)(schema_1.notification.status, ['Sent', 'Delivered', 'Read']), (0, drizzle_orm_1.sql) `${schema_1.notification.sentAt} > now() - interval '1 day'`));
            if (sent.n >= cap)
                return { action: 'suppress', reason: 'CONTACT_LIMIT' };
        }
        return { action: 'send' };
    }
    async recordAttempt(tx, n, rule, result, code, messageId, permanent) {
        const attempt = n.attempts + 1;
        const max = rule?.maxAttempts ?? 3;
        const backoff = rule?.retryBackoffSeconds ?? [60, 300];
        const next = !permanent && attempt < max ? new Date(Date.now() + (backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 60) * 1000) : null;
        await tx.orm.insert(schema_1.deliveryAttempt).values({
            notificationId: n.id, attemptNo: attempt, provider: n.channel === 'SMS' ? 'SMS_GATEWAY' : n.channel === 'PUSH' ? 'FCM' : 'IN_APP', providerMessageId: messageId,
            result, errorCode: code, requestedAt: (0, drizzle_orm_1.sql) `now()`, resultAt: (0, drizzle_orm_1.sql) `now()`, nextRetryAt: next,
        });
        if (next) {
            await tx.orm
                .update(schema_1.notification)
                .set({ status: 'Queued', queuedAt: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.notification.queuedAt}, now())`, scheduledFor: next, updatedAt: (0, drizzle_orm_1.sql) `now()` })
                .where((0, drizzle_orm_1.eq)(schema_1.notification.id, n.id));
            return;
        }
        await tx.orm
            .update(schema_1.notification)
            .set({ status: 'Failed', failedAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.notification.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
            .where((0, drizzle_orm_1.eq)(schema_1.notification.id, n.id));
        if (n.is_critical && n.request_id)
            await this.alertDeliveryFailure(tx, n, n.request_id);
    }
    async alertDeliveryFailure(tx, n, requestId) {
        const request = (await (0, read_model_public_3.requestRouting)(tx, [requestId])).get(requestId);
        const targets = new Set(await (0, read_model_public_1.caseOwnersForRequest)(tx, requestId));
        if (request?.assignedSupportUserId)
            targets.add(request.assignedSupportUserId);
        await this.notifications.enqueue(tx, {
            eventCode: 'NTF-EV-18', aggregateType: 'NOTIFICATION', aggregateId: n.id, dedupeBase: `delivery-failed:${n.id}`,
            recipients: [...targets].map((userId) => ({ userId, role: 'SUP' })), requestId,
            vars: { ref: request?.referenceNo ?? '' },
        });
    }
    async rule(tx, eventCode, role) {
        if (!role)
            return null;
        const [row] = await tx.orm
            .select({
            maxAttempts: schema_1.notificationRule.maxAttempts, retryBackoffSeconds: schema_1.notificationRule.retryBackoffSeconds,
            maxSmsPerRequestPerDay: schema_1.notificationRule.maxSmsPerRequestPerDay, respectsQuietHours: schema_1.notificationRule.respectsQuietHours,
        })
            .from(schema_1.notificationRule)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.notificationRule.eventCode, eventCode), (0, drizzle_orm_1.eq)(schema_1.notificationRule.recipientRole, role)));
        return row ?? null;
    }
};
exports.NotificationDispatcher = NotificationDispatcher;
exports.NotificationDispatcher = NotificationDispatcher = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(notification_service_1.NotificationService)),
    __param(2, (0, common_1.Inject)(gateway_ports_1.PushGateway)),
    __param(3, (0, common_1.Inject)(gateway_ports_1.SmsGateway)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        notification_service_1.NotificationService,
        gateway_ports_1.PushGateway,
        gateway_ports_1.SmsGateway])
], NotificationDispatcher);
//# sourceMappingURL=notification.dispatcher.js.map