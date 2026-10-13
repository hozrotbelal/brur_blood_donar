import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Db, DatabaseService } from '../../platform/db/database.service';
import { staffAreaIds } from '../../platform/policy/area-scope';
import { Principal } from '../../platform/policy/policy.types';
import { EnqueueInput, Lang, Vars } from './notification.types';
import { render } from './template.renderer';

interface RuleRow {
  channels: string[];
  is_critical: boolean;
}

const KEEP_ON_CLOSE = ['NTF-EV-09', 'NTF-EV-13', 'NTF-EV-18'];

@Injectable()
export class NotificationService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async enqueue(tx: Db, input: EnqueueInput): Promise<number> {
    const event = await tx.query<{ id: string }>(
      `INSERT INTO ntf.notification_event (event_code, aggregate_type, aggregate_id, request_id, case_id, payload, source_outbox_event_id)
       VALUES ($1::ntf_event_code, $2, $3, $4, $5, $6::jsonb, $7)
       ON CONFLICT (source_outbox_event_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [input.eventCode, input.aggregateType, input.aggregateId, input.requestId ?? null, input.caseId ?? null, JSON.stringify({ urgency: input.urgency ?? null, varsByLang: { bn: this.varsFor(input, 'bn'), en: this.varsFor(input, 'en') } }), input.sourceOutboxEventId ?? null],
    );
    const eventId = event.rows[0].id;
    let created = 0;
    const seen = new Set<string>();
    for (const r of input.recipients) {
      const key = `${r.userId}:${r.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const rule = await tx.query<RuleRow>(
        'SELECT channels::text[] AS channels, is_critical FROM ntf.notification_rule WHERE event_code = $1::ntf_event_code AND recipient_role = $2::role_code AND enabled',
        [input.eventCode, r.role],
      );
      if (!rule.rows[0]) continue;
      const lang = await this.languageOf(tx, r.userId);
      if (!lang) continue;
      const vars = this.varsFor(input, lang);
      const critical = rule.rows[0].is_critical || (input.eventCode === 'NTF-EV-04' && input.urgency === 'Critical');
      for (const channel of rule.rows[0].channels.filter((c) => c !== 'SMS')) {
        const text = await this.template(tx, input.eventCode, channel, lang);
        if (!text) continue;
        const inserted = await tx.query(
          `INSERT INTO ntf.notification
             (notification_event_id, recipient_user_id, channel, template_version_id, language, request_id, case_id, invitation_id,
              dedupe_key, is_critical, rendered_title, rendered_body, scheduled_for)
           VALUES ($1, $2, $3::notification_channel, $4, $5::ui_language, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            eventId, r.userId, channel, text.id, lang, input.requestId ?? null, input.caseId ?? null, input.invitationId ?? null,
            `${input.dedupeBase}:${r.userId}:${channel}`, critical,
            text.title ? render(text.title, vars) : null, render(text.body, vars), input.scheduledFor ?? new Date(),
          ],
        );
        created += inserted.rowCount ?? 0;
      }
    }
    await tx.query(`UPDATE ntf.notification_event SET status = $2::ntf_event_status, updated_at = now() WHERE id = $1`, [eventId, created > 0 ? 'Processed' : 'Skipped']);
    return created;
  }

  async cancelForRequest(tx: Db, requestId: string, reason: 'REQUEST_CLOSED' | 'OUTREACH_PAUSED' | 'SUPERSEDED' = 'REQUEST_CLOSED'): Promise<number> {
    const res = await tx.query(
      `UPDATE ntf.notification n SET status = 'Cancelled', cancel_reason = $3::notification_cancel_reason, cancelled_at = now(), version = version + 1, updated_at = now()
         FROM ntf.notification_event e
        WHERE n.notification_event_id = e.id AND n.request_id = $1 AND n.status IN ('Pending','Queued') AND NOT (e.event_code::text = ANY($2::text[]))`,
      [requestId, KEEP_ON_CLOSE, reason],
    );
    return res.rowCount ?? 0;
  }

  async inbox(principal: Principal, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const { rows } = await this.db.query<{ id: string; event_code: string; rendered_title: string | null; rendered_body: string | null; created_at: Date; read_at: Date | null; request_id: string | null; invitation_id: string | null; is_critical: boolean }>(
      `SELECT n.id, e.event_code, n.rendered_title, n.rendered_body, n.created_at, n.read_at, n.request_id, n.invitation_id, n.is_critical
         FROM ntf.notification n JOIN ntf.notification_event e ON e.id = n.notification_event_id
        WHERE n.recipient_user_id = $1 AND n.channel = 'IN_APP' AND n.status IN ('Delivered','Read') ${opts.unreadOnly ? 'AND n.read_at IS NULL' : ''}
        ORDER BY n.created_at DESC LIMIT $2`,
      [principal.userId, limit],
    );
    return rows.map((r) => ({
      id: r.id, eventCode: r.event_code, title: r.rendered_title, body: r.rendered_body, createdAt: r.created_at, read: r.read_at !== null,
      requestId: r.request_id, invitationId: r.invitation_id, critical: r.is_critical,
    }));
  }

  async unreadCount(principal: Principal) {
    const { rows } = await this.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ntf.notification WHERE recipient_user_id = $1 AND channel = 'IN_APP' AND status = 'Delivered' AND read_at IS NULL`,
      [principal.userId],
    );
    return { unread: rows[0].n };
  }

  async markRead(principal: Principal, id: string) {
    const res = await this.db.query(
      `UPDATE ntf.notification SET status = 'Read', read_at = COALESCE(read_at, now()), delivered_at = COALESCE(delivered_at, now()), version = version + 1, updated_at = now()
        WHERE id = $1 AND recipient_user_id = $2 AND status IN ('Sent','Delivered','Read')`,
      [id, principal.userId],
    );
    if (!res.rowCount) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    await this.markCompanionsRead(id);
    return { id, read: true };
  }

  async markAllRead(principal: Principal) {
    const res = await this.db.query(
      `UPDATE ntf.notification SET status = 'Read', read_at = now(), version = version + 1, updated_at = now()
        WHERE recipient_user_id = $1 AND channel = 'IN_APP' AND status = 'Delivered'`,
      [principal.userId],
    );
    return { updated: res.rowCount ?? 0 };
  }

  async receipt(principal: Principal, id: string) {
    const res = await this.db.query(
      `UPDATE ntf.notification SET status = CASE WHEN status = 'Sent' THEN 'Delivered'::notification_status ELSE status END, delivered_at = COALESCE(delivered_at, now()), updated_at = now()
        WHERE id = $1 AND recipient_user_id = $2 AND channel = 'PUSH' AND status IN ('Sent','Delivered','Read')`,
      [id, principal.userId],
    );
    if (!res.rowCount) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    return { id, delivered: true };
  }

  async registerPushToken(principal: Principal, installId: string, token: string) {
    const res = await this.db.query(
      `UPDATE idn.device SET push_token = $3, last_seen_at = now(), updated_at = now() WHERE user_id = $1 AND install_id = $2 AND sign_out_status = 'Active'`,
      [principal.userId, installId, token],
    );
    if (!res.rowCount) throw new NotFoundException({ code: 'DEVICE_NOT_FOUND' });
    return { registered: true };
  }

  async deliveryReport(principal: Principal, scope: 'Area' | 'All', days = 7) {
    const areas = scope === 'Area' ? await staffAreaIds(this.db, principal.userId) : [];
    if (scope === 'Area' && areas.length === 0) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    const { rows } = await this.db.query<{ id: string; event_code: string; channel: string; status: string; is_critical: boolean; request_id: string | null; reference_no: string | null; failed_at: Date | null; attempts: number }>(
      `SELECT n.id, e.event_code, n.channel, n.status, n.is_critical, n.request_id, r.reference_no, n.failed_at,
              (SELECT count(*)::int FROM ntf.delivery_attempt a WHERE a.notification_id = n.id) AS attempts
         FROM ntf.notification n JOIN ntf.notification_event e ON e.id = n.notification_event_id LEFT JOIN req.blood_request r ON r.id = n.request_id
        WHERE n.status IN ('Failed','Suppressed') AND n.updated_at > now() - make_interval(days => $1::int)
          ${scope === 'Area' ? 'AND r.area_id = ANY($2::uuid[])' : ''}
        ORDER BY n.is_critical DESC, n.updated_at DESC LIMIT 200`,
      scope === 'Area' ? [days, areas] : [days],
    );
    return rows.map((r) => ({ id: r.id, eventCode: r.event_code, channel: r.channel, status: r.status, critical: r.is_critical, requestId: r.request_id, requestReference: r.reference_no, failedAt: r.failed_at, attempts: r.attempts }));
  }

  private async markCompanionsRead(id: string) {
    await this.db.query(
      `UPDATE ntf.notification o SET read_at = COALESCE(o.read_at, now()), updated_at = now()
        FROM ntf.notification n WHERE n.id = $1 AND o.notification_event_id = n.notification_event_id AND o.recipient_user_id = n.recipient_user_id AND o.id <> n.id`,
      [id],
    );
  }

  private varsFor(input: EnqueueInput, lang: Lang): Vars {
    return typeof input.vars === 'function' ? input.vars(lang) : input.vars;
  }

  private async languageOf(db: Db, userId: string): Promise<Lang | null> {
    const { rows } = await db.query<{ preferred_language: Lang }>('SELECT preferred_language FROM idn.app_user WHERE id = $1 AND deleted_at IS NULL', [userId]);
    return rows[0]?.preferred_language ?? null;
  }

  private async template(db: Db, eventCode: string, channel: string, lang: Lang) {
    const { rows } = await db.query<{ id: string; title: string | null; body: string }>(
      `SELECT v.id, v.title, v.body FROM ntf.notification_template t JOIN ntf.template_version v ON v.template_id = t.id AND v.status = 'Approved'
        WHERE t.event_code = $1::ntf_event_code AND t.channel = $2::notification_channel AND t.status = 'Active'
        ORDER BY (v.language = $3::ui_language) DESC LIMIT 1`,
      [eventCode, channel, lang],
    );
    return rows[0] ?? null;
  }
}
