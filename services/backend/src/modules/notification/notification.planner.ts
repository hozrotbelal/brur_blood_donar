import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { DomainEvent, EventBus } from '../../platform/outbox/event-bus';
import { NotificationService } from './notification.service';
import { Lang, Recipient } from './notification.types';
import { appointmentLabel, formatTime, outcomeLabel, urgencyLabel } from './template.renderer';

interface RequestInfo {
  id: string;
  reference_no: string | null;
  urgency: string;
  blood_group: string;
  requester: string;
  assigned: string | null;
  area_id: string | null;
}

const REMINDER_OFFSETS_HOURS = [24, 2];

@Injectable()
export class NotificationPlanner implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(NotificationService) private readonly notifications: NotificationService,
  ) {}

  onModuleInit() {
    const on = (type: string, handler: (tx: Db, e: DomainEvent) => Promise<void>) =>
      this.bus.subscribe(type, (e) => this.db.transaction((tx) => handler(tx, e)));
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
  }

  async scheduleReminders(limit = 200): Promise<number> {
    const { rows } = await this.db.query<{ id: string; scheduled_start: Date; request_id: string; case_id: string; donor_user_id: string; facility_en: string; facility_bn: string | null; reference_no: string | null; urgency: string }>(
      `SELECT a.id, a.scheduled_start, c.request_id, c.id AS case_id, d.user_id AS donor_user_id, f.name_en AS facility_en, f.name_bn AS facility_bn, r.reference_no, r.urgency::text
         FROM crd.appointment a JOIN crd.coordination_case c ON c.id = a.case_id JOIN crd.case_donor cd ON cd.id = a.case_donor_id
         JOIN idn.donor_profile d ON d.id = cd.donor_profile_id JOIN apt.facility f ON f.id = a.facility_id JOIN req.blood_request r ON r.id = c.request_id
        WHERE a.status = 'Confirmed' AND NOT a.reminders_stopped AND a.scheduled_start > now() AND a.scheduled_start <= now() + make_interval(hours => $1::int) LIMIT $2`,
      [REMINDER_OFFSETS_HOURS[0], limit],
    );
    let created = 0;
    for (const a of rows) {
      const hoursLeft = (a.scheduled_start.getTime() - Date.now()) / 3_600_000;
      const offset = [...REMINDER_OFFSETS_HOURS].sort((x, y) => x - y).find((o) => hoursLeft <= o);
      if (offset === undefined) continue;
      created += await this.db.transaction((tx) =>
        this.notifications.enqueue(tx, {
          eventCode: 'NTF-EV-14', aggregateType: 'APPOINTMENT', aggregateId: a.id, dedupeBase: `reminder:${a.id}:${offset}`,
          recipients: [{ userId: a.donor_user_id, role: 'DON' }], requestId: a.request_id, caseId: a.case_id, urgency: a.urgency,
          vars: (lang) => ({ ref: a.reference_no ?? '', time: formatTime(lang, a.scheduled_start), facility: lang === 'bn' ? a.facility_bn ?? a.facility_en : a.facility_en }),
        }),
      );
    }
    return created;
  }

  async scheduleDonationDateReminders(limit = 200): Promise<number> {
    const { rows } = await this.db.query<{ id: string; user_id: string; due: string }>(
      `SELECT d.id, d.user_id, d.provisional_next_contact_date::text AS due FROM idn.donor_profile d JOIN idn.app_user u ON u.id = d.user_id
        WHERE d.provisional_next_contact_date <= (now() AT TIME ZONE 'Asia/Dhaka')::date AND u.account_status = 'Active' AND u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM ntf.notification n WHERE n.dedupe_key LIKE 'next-date:' || d.id || ':' || d.provisional_next_contact_date::text || ':%')
        LIMIT $1`,
      [limit],
    );
    let created = 0;
    for (const d of rows) {
      created += await this.db.transaction((tx) =>
        this.notifications.enqueue(tx, {
          eventCode: 'NTF-EV-11', aggregateType: 'DONOR_PROFILE', aggregateId: d.id, dedupeBase: `next-date:${d.id}:${d.due}`,
          recipients: [{ userId: d.user_id, role: 'DON' }], vars: {},
        }),
      );
    }
    return created;
  }

  private async request(db: Db, id: string): Promise<RequestInfo | null> {
    const { rows } = await db.query<RequestInfo>(
      `SELECT id, reference_no, urgency::text, requested_blood_group::text AS blood_group, created_by_user_id AS requester, assigned_support_user_id AS assigned, area_id FROM req.blood_request WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  private async staff(db: Db, req: RequestInfo): Promise<Recipient[]> {
    const owner = await db.query<{ owner_user_id: string | null }>('SELECT owner_user_id FROM crd.coordination_case WHERE request_id = $1', [req.id]);
    const direct = owner.rows[0]?.owner_user_id ?? req.assigned;
    if (direct) return [{ userId: direct, role: 'SUP' }];
    if (!req.area_id) return [];
    const { rows } = await db.query<{ user_id: string }>(
      `SELECT DISTINCT ur.user_id FROM idn.user_role ur JOIN idn.role r ON r.id = ur.role_id AND r.code = 'SUP' JOIN idn.permission_scope s ON s.user_role_id = ur.id
        WHERE ur.status = 'Active' AND s.revoked_at IS NULL AND s.area_id = $1 LIMIT 20`,
      [req.area_id],
    );
    return rows.map((r) => ({ userId: r.user_id, role: 'SUP' as const }));
  }

  private base(e: DomainEvent, req: RequestInfo) {
    return { aggregateType: e.aggregateType, aggregateId: e.aggregateId, dedupeBase: `ev:${e.id}`, sourceOutboxEventId: e.id, requestId: req.id, urgency: req.urgency };
  }

  private async requestSubmitted(tx: Db, e: DomainEvent) {
    const req = await this.request(tx, e.aggregateId);
    if (!req) return;
    await this.notifications.enqueue(tx, {
      ...this.base(e, req), eventCode: 'NTF-EV-01',
      recipients: [{ userId: req.requester, role: 'PAT' }, ...(await this.staff(tx, req))], vars: { ref: req.reference_no ?? '' },
    });
  }

  private async requestEvent(tx: Db, e: DomainEvent, code: string, withStaff: boolean) {
    const req = await this.request(tx, e.aggregateId);
    if (!req) return;
    await this.notifications.enqueue(tx, {
      ...this.base(e, req), eventCode: code,
      recipients: [{ userId: req.requester, role: 'PAT' }, ...(withStaff ? await this.staff(tx, req) : [])], vars: { ref: req.reference_no ?? '' },
    });
  }

  private async invitationSent(tx: Db, e: DomainEvent) {
    const inv = await tx.query<{ request_id: string; user_id: string }>(
      'SELECT i.request_id, d.user_id FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id WHERE i.id = $1',
      [e.aggregateId],
    );
    const row = inv.rows[0];
    const req = row && (await this.request(tx, row.request_id));
    if (!row || !req) return;
    await this.notifications.enqueue(tx, {
      ...this.base(e, req), eventCode: 'NTF-EV-04', invitationId: e.aggregateId,
      recipients: [{ userId: row.user_id, role: 'DON' }],
      vars: (lang: Lang) => ({ urgency: urgencyLabel(lang, req.urgency), bloodGroup: req.blood_group }),
    });
  }

  private async invitationResponded(tx: Db, e: DomainEvent) {
    if (e.payload.response !== 'Available') return;
    const inv = await tx.query<{ request_id: string; user_id: string }>(
      'SELECT i.request_id, d.user_id FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id WHERE i.id = $1',
      [e.aggregateId],
    );
    const row = inv.rows[0];
    const req = row && (await this.request(tx, row.request_id));
    if (!row || !req) return;
    await this.notifications.enqueue(tx, {
      ...this.base(e, req), eventCode: 'NTF-EV-05', invitationId: e.aggregateId,
      recipients: [{ userId: row.user_id, role: 'DON' }, ...(await this.staff(tx, req))], vars: { ref: req.reference_no ?? '' },
    });
  }

  private async appointmentChanged(tx: Db, e: DomainEvent, status: 'proposed' | 'confirmed') {
    const { rows } = await tx.query<{ scheduled_start: Date; request_id: string; case_id: string; donor_user_id: string; facility_en: string; facility_bn: string | null }>(
      `SELECT a.scheduled_start, c.request_id, c.id AS case_id, d.user_id AS donor_user_id, f.name_en AS facility_en, f.name_bn AS facility_bn
         FROM crd.appointment a JOIN crd.coordination_case c ON c.id = a.case_id JOIN crd.case_donor cd ON cd.id = a.case_donor_id
         JOIN idn.donor_profile d ON d.id = cd.donor_profile_id JOIN apt.facility f ON f.id = a.facility_id WHERE a.id = $1`,
      [e.aggregateId],
    );
    const a = rows[0];
    const req = a && (await this.request(tx, a.request_id));
    if (!a || !req) return;
    await this.notifications.enqueue(tx, {
      ...this.base(e, req), eventCode: 'NTF-EV-07', caseId: a.case_id,
      recipients: [{ userId: a.donor_user_id, role: 'DON' }, { userId: req.requester, role: 'PAT' }, ...(await this.staff(tx, req))],
      vars: (lang) => ({
        ref: req.reference_no ?? '', status: appointmentLabel(lang, status), time: formatTime(lang, a.scheduled_start),
        facility: lang === 'bn' ? a.facility_bn ?? a.facility_en : a.facility_en,
      }),
    });
  }

  private async donorLeft(tx: Db, e: DomainEvent) {
    const c = await tx.query<{ request_id: string }>('SELECT request_id FROM crd.coordination_case WHERE id = $1', [e.aggregateId]);
    const req = c.rows[0] && (await this.request(tx, c.rows[0].request_id));
    if (!req) return;
    await this.notifications.enqueue(tx, {
      ...this.base(e, req), eventCode: 'NTF-EV-08', caseId: e.aggregateId,
      recipients: [{ userId: req.requester, role: 'PAT' }, ...(await this.staff(tx, req))], vars: { ref: req.reference_no ?? '' },
    });
  }

  private async outcome(tx: Db, e: DomainEvent, kind: 'fulfilled' | 'partial') {
    const req = await this.request(tx, e.aggregateId);
    if (!req) return;
    const donors = await tx.query<{ user_id: string }>(
      `SELECT DISTINCT d.user_id FROM crd.case_donor cd JOIN crd.coordination_case c ON c.id = cd.case_id JOIN idn.donor_profile d ON d.id = cd.donor_profile_id
        WHERE c.request_id = $1 AND cd.status = 'Active'`,
      [req.id],
    );
    await this.notifications.enqueue(tx, {
      ...this.base(e, req), eventCode: 'NTF-EV-09',
      recipients: [{ userId: req.requester, role: 'PAT' }, ...(await this.staff(tx, req)), ...donors.rows.map((d) => ({ userId: d.user_id, role: 'DON' as const }))],
      vars: (lang) => ({ ref: req.reference_no ?? '', outcome: outcomeLabel(lang, kind) }),
    });
  }

  private async requestClosed(tx: Db, e: DomainEvent, tellDonors: boolean) {
    const req = await this.request(tx, e.aggregateId);
    if (!req) return;
    await this.notifications.cancelForRequest(tx, req.id);
    if (!tellDonors) return;
    const donors = await tx.query<{ user_id: string }>(
      `SELECT DISTINCT d.user_id FROM src.invitation i JOIN idn.donor_profile d ON d.id = i.donor_profile_id
        WHERE i.request_id = $1 AND (i.status IN ('Sent','Viewed') OR (i.status = 'Responded' AND i.response = 'Available'))`,
      [req.id],
    );
    await this.notifications.enqueue(tx, {
      ...this.base(e, req), eventCode: 'NTF-EV-13',
      recipients: [...donors.rows.map((d) => ({ userId: d.user_id, role: 'DON' as const })), ...(await this.staff(tx, req))], vars: { ref: req.reference_no ?? '' },
    });
  }
}
