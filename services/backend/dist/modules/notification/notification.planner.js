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
exports.NotificationPlanner = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../../platform/db/database.service");
const event_bus_1 = require("../../platform/outbox/event-bus");
const notification_service_1 = require("./notification.service");
const template_renderer_1 = require("./template.renderer");
const REMINDER_OFFSETS_HOURS = [24, 2];
// Raw SQL: each query here reads other modules' tables to address recipients (ADR-16 rule 6).
let NotificationPlanner = class NotificationPlanner {
    db;
    bus;
    notifications;
    constructor(db, bus, notifications) {
        this.db = db;
        this.bus = bus;
        this.notifications = notifications;
    }
    onModuleInit() {
        const on = (type, handler) => this.bus.subscribe(type, (e) => this.db.transaction((tx) => handler(tx, e)));
        on('RequestSubmitted', (tx, e) => this.requestSubmitted(tx, e));
        on('RequestInformationRequested', (tx, e) => this.requestEvent(tx, e, 'NTF-EV-02', false));
        on('RequestVerified', (tx, e) => this.requestEvent(tx, e, 'NTF-EV-03', true));
        on('InvitationSent', (tx, e) => this.invitationSent(tx, e));
        on('InvitationResponded', (tx, e) => this.invitationResponded(tx, e));
        on('AppointmentProposed', (tx, e) => this.appointmentChanged(tx, e, 'proposed'));
        on('AppointmentConfirmed', (tx, e) => this.appointmentChanged(tx, e, 'confirmed'));
        on('DonorLeftCase', (tx, e) => this.donorLeft(tx, e));
        on('RequestFulfilled', (tx, e) => this.outcome(tx, e, 'fulfilled'));
        on('RequestPartiallyFulfilled', (tx, e) => this.outcome(tx, e, 'partial'));
        on('RequestCancelled', (tx, e) => this.requestClosed(tx, e, true));
        on('RequestUnableToFulfil', (tx, e) => this.requestClosed(tx, e, true));
        on('RequestRejected', (tx, e) => this.requestClosed(tx, e, false));
        on('SecurityAlertRaised', (tx, e) => this.securityAlert(tx, e));
        on('InvitationsCancelled', (tx, e) => this.invitationsCancelled(tx, e));
    }
    async securityAlert(tx, e) {
        const role = e.payload.role;
        const kind = String(e.payload.kind ?? '');
        if (!role || !kind)
            return;
        const occurredAt = typeof e.payload.occurredAt === 'string' ? new Date(e.payload.occurredAt) : new Date();
        await this.notifications.enqueue(tx, {
            eventCode: 'NTF-EV-21', aggregateType: 'APP_USER', aggregateId: e.aggregateId, dedupeBase: `ev:${e.id}`, sourceOutboxEventId: e.id,
            recipients: [{ userId: e.aggregateId, role }],
            vars: (lang) => ({ event: (0, template_renderer_1.securityEventLabel)(lang, kind), time: (0, template_renderer_1.formatTime)(lang, occurredAt) }),
        });
    }
    async scheduleReminders(limit = 200) {
        const { rows } = await this.db.query(`SELECT a.id, a.scheduled_start, c.request_id, c.id AS case_id, d.user_id AS donor_user_id, f.name_en AS facility_en, f.name_bn AS facility_bn, r.reference_no, r.urgency::text
         FROM crd.appointment a JOIN crd.coordination_case c ON c.id = a.case_id JOIN crd.case_donor cd ON cd.id = a.case_donor_id
         JOIN idn.donor_profile d ON d.id = cd.donor_profile_id JOIN apt.facility f ON f.id = a.facility_id JOIN req.blood_request r ON r.id = c.request_id
        WHERE a.status = 'Confirmed' AND NOT a.reminders_stopped AND a.scheduled_start > now() AND a.scheduled_start <= now() + make_interval(hours => $1::int) LIMIT $2`, [REMINDER_OFFSETS_HOURS[0], limit]);
        let created = 0;
        for (const a of rows) {
            const hoursLeft = (a.scheduled_start.getTime() - Date.now()) / 3_600_000;
            const offset = [...REMINDER_OFFSETS_HOURS].sort((x, y) => x - y).find((o) => hoursLeft <= o);
            if (offset === undefined)
                continue;
            created += await this.db.transaction((tx) => this.notifications.enqueue(tx, {
                eventCode: 'NTF-EV-14', aggregateType: 'APPOINTMENT', aggregateId: a.id, dedupeBase: `reminder:${a.id}:${offset}`,
                recipients: [{ userId: a.donor_user_id, role: 'DON' }], requestId: a.request_id, caseId: a.case_id, urgency: a.urgency,
                vars: (lang) => ({ ref: a.reference_no ?? '', time: (0, template_renderer_1.formatTime)(lang, a.scheduled_start), facility: lang === 'bn' ? a.facility_bn ?? a.facility_en : a.facility_en }),
            }));
        }
        return created;
    }
    async scheduleDonationDateReminders(limit = 200) {
        const { rows } = await this.db.query(`SELECT d.id, d.user_id, d.provisional_next_contact_date::text AS due FROM idn.donor_profile d JOIN idn.app_user u ON u.id = d.user_id
        WHERE d.provisional_next_contact_date <= (now() AT TIME ZONE 'Asia/Dhaka')::date AND u.account_status = 'Active' AND u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM ntf.notification n WHERE n.dedupe_key LIKE 'next-date:' || d.id || ':' || d.provisional_next_contact_date::text || ':%')
        LIMIT $1`, [limit]);
        let created = 0;
        for (const d of rows) {
            created += await this.db.transaction((tx) => this.notifications.enqueue(tx, {
                eventCode: 'NTF-EV-11', aggregateType: 'DONOR_PROFILE', aggregateId: d.id, dedupeBase: `next-date:${d.id}:${d.due}`,
                recipients: [{ userId: d.user_id, role: 'DON' }], vars: {},
            }));
        }
        return created;
    }
    async request(db, id) {
        const { rows } = await db.query(`SELECT id, reference_no, urgency::text, requested_blood_group::text AS blood_group, created_by_user_id AS requester, assigned_support_user_id AS assigned, area_id FROM req.blood_request WHERE id = $1`, [id]);
        return rows[0] ?? null;
    }
    async staff(db, req) {
        const owner = await db.query('SELECT owner_user_id FROM crd.coordination_case WHERE request_id = $1', [req.id]);
        const direct = owner.rows[0]?.owner_user_id ?? req.assigned;
        if (direct)
            return [{ userId: direct, role: 'SUP' }];
        if (!req.area_id)
            return [];
        const { rows } = await db.query(`SELECT DISTINCT ur.user_id FROM idn.user_role ur JOIN idn.role r ON r.id = ur.role_id AND r.code = 'SUP' JOIN idn.permission_scope s ON s.user_role_id = ur.id
        WHERE ur.status = 'Active' AND s.revoked_at IS NULL AND s.area_id = $1 LIMIT 20`, [req.area_id]);
        return rows.map((r) => ({ userId: r.user_id, role: 'SUP' }));
    }
    base(e, req) {
        return { aggregateType: e.aggregateType, aggregateId: e.aggregateId, dedupeBase: `ev:${e.id}`, sourceOutboxEventId: e.id, requestId: req.id, urgency: req.urgency };
    }
    async requestSubmitted(tx, e) {
        const req = await this.request(tx, e.aggregateId);
        if (!req)
            return;
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: 'NTF-EV-01',
            recipients: [{ userId: req.requester, role: 'PAT' }, ...(await this.staff(tx, req))], vars: { ref: req.reference_no ?? '' },
        });
    }
    async requestEvent(tx, e, code, withStaff) {
        const req = await this.request(tx, e.aggregateId);
        if (!req)
            return;
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: code,
            recipients: [{ userId: req.requester, role: 'PAT' }, ...(withStaff ? await this.staff(tx, req) : [])], vars: { ref: req.reference_no ?? '' },
        });
    }
    async invitationSent(tx, e) {
        const inv = await tx.query('SELECT i.request_id, d.user_id FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id WHERE i.id = $1', [e.aggregateId]);
        const row = inv.rows[0];
        const req = row && (await this.request(tx, row.request_id));
        if (!row || !req)
            return;
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: 'NTF-EV-04', invitationId: e.aggregateId,
            recipients: [{ userId: row.user_id, role: 'DON' }],
            vars: (lang) => ({ urgency: (0, template_renderer_1.urgencyLabel)(lang, req.urgency), bloodGroup: req.blood_group }),
        });
    }
    async invitationResponded(tx, e) {
        if (e.payload.response !== 'Available')
            return;
        const inv = await tx.query('SELECT i.request_id, d.user_id FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id WHERE i.id = $1', [e.aggregateId]);
        const row = inv.rows[0];
        const req = row && (await this.request(tx, row.request_id));
        if (!row || !req)
            return;
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: 'NTF-EV-05', invitationId: e.aggregateId,
            recipients: [{ userId: row.user_id, role: 'DON' }, ...(await this.staff(tx, req))], vars: { ref: req.reference_no ?? '' },
        });
    }
    async appointmentChanged(tx, e, status) {
        const { rows } = await tx.query(`SELECT a.scheduled_start, c.request_id, c.id AS case_id, d.user_id AS donor_user_id, f.name_en AS facility_en, f.name_bn AS facility_bn
         FROM crd.appointment a JOIN crd.coordination_case c ON c.id = a.case_id JOIN crd.case_donor cd ON cd.id = a.case_donor_id
         JOIN idn.donor_profile d ON d.id = cd.donor_profile_id JOIN apt.facility f ON f.id = a.facility_id WHERE a.id = $1`, [e.aggregateId]);
        const a = rows[0];
        const req = a && (await this.request(tx, a.request_id));
        if (!a || !req)
            return;
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: 'NTF-EV-07', caseId: a.case_id,
            recipients: [{ userId: a.donor_user_id, role: 'DON' }, { userId: req.requester, role: 'PAT' }, ...(await this.staff(tx, req))],
            vars: (lang) => ({
                ref: req.reference_no ?? '', status: (0, template_renderer_1.appointmentLabel)(lang, status), time: (0, template_renderer_1.formatTime)(lang, a.scheduled_start),
                facility: lang === 'bn' ? a.facility_bn ?? a.facility_en : a.facility_en,
            }),
        });
    }
    async donorLeft(tx, e) {
        const c = await tx.query('SELECT request_id FROM crd.coordination_case WHERE id = $1', [e.aggregateId]);
        const req = c.rows[0] && (await this.request(tx, c.rows[0].request_id));
        if (!req)
            return;
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: 'NTF-EV-08', caseId: e.aggregateId,
            recipients: [{ userId: req.requester, role: 'PAT' }, ...(await this.staff(tx, req))], vars: { ref: req.reference_no ?? '' },
        });
    }
    async outcome(tx, e, kind) {
        const req = await this.request(tx, e.aggregateId);
        if (!req)
            return;
        const donors = await tx.query(`SELECT DISTINCT d.user_id FROM crd.case_donor cd JOIN crd.coordination_case c ON c.id = cd.case_id JOIN idn.donor_profile d ON d.id = cd.donor_profile_id
        WHERE c.request_id = $1 AND cd.status = 'Active'`, [req.id]);
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: 'NTF-EV-09',
            recipients: [{ userId: req.requester, role: 'PAT' }, ...(await this.staff(tx, req)), ...donors.rows.map((d) => ({ userId: d.user_id, role: 'DON' }))],
            vars: (lang) => ({ ref: req.reference_no ?? '', outcome: (0, template_renderer_1.outcomeLabel)(lang, kind) }),
        });
    }
    async invitationsCancelled(tx, e) {
        const req = await this.request(tx, e.aggregateId);
        const ids = Array.isArray(e.payload.invitationIds) ? e.payload.invitationIds : [];
        if (!req || ids.length === 0)
            return;
        const donors = await tx.query(`SELECT DISTINCT d.user_id FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id WHERE i.id = ANY($1::uuid[])`, [ids]);
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: 'NTF-EV-13',
            recipients: donors.rows.map((d) => ({ userId: d.user_id, role: 'DON' })), vars: { ref: req.reference_no ?? '' },
        });
    }
    async requestClosed(tx, e, tellDonors) {
        const req = await this.request(tx, e.aggregateId);
        if (!req)
            return;
        await this.notifications.cancelForRequest(tx, req.id);
        if (!tellDonors)
            return;
        const donors = await tx.query(`SELECT DISTINCT d.user_id FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id
        WHERE i.request_id = $1 AND (i.status IN ('Sent','Viewed') OR (i.status = 'Responded' AND i.response = 'Available'))`, [req.id]);
        await this.notifications.enqueue(tx, {
            ...this.base(e, req), eventCode: 'NTF-EV-13',
            recipients: [...donors.rows.map((d) => ({ userId: d.user_id, role: 'DON' })), ...(await this.staff(tx, req))], vars: { ref: req.reference_no ?? '' },
        });
    }
};
exports.NotificationPlanner = NotificationPlanner;
exports.NotificationPlanner = NotificationPlanner = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(1, (0, common_1.Inject)(event_bus_1.EventBus)),
    __param(2, (0, common_1.Inject)(notification_service_1.NotificationService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService,
        event_bus_1.EventBus,
        notification_service_1.NotificationService])
], NotificationPlanner);
//# sourceMappingURL=notification.planner.js.map