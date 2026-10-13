import { Inject, Injectable, Logger } from '@nestjs/common';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { NotificationService } from './notification.service';
import { categoryOf, NotificationRow } from './notification.types';
import { PushGateway, SmsGateway } from './gateway.ports';

interface Rule {
  max_attempts: number;
  retry_backoff_seconds: number[];
  max_sms_per_request_per_day: number;
  respects_quiet_hours: boolean;
  sms_fallback_allowed: boolean;
  fallback_after_seconds: Record<string, number> | null;
}

type Decision = { action: 'send' } | { action: 'suppress'; reason: string } | { action: 'defer'; until: Date } | { action: 'fail'; code: string };

const DHAKA_OFFSET_MIN = 6 * 60;

function minutesOfDay(d: Date) {
  const local = new Date(d.getTime() + DHAKA_OFFSET_MIN * 60_000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
}

function timeToMinutes(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function quietUntil(now: Date, start: string, end: string): Date | null {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  const cur = minutesOfDay(now);
  const inside = s <= e ? cur >= s && cur < e : cur >= s || cur < e;
  if (!inside) return null;
  const wait = (e - cur + 1440) % 1440 || 1440;
  return new Date(now.getTime() + wait * 60_000 - now.getSeconds() * 1000 - now.getMilliseconds());
}

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger('NotificationDispatcher');

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(NotificationService) private readonly notifications: NotificationService,
    @Inject(PushGateway) private readonly push: PushGateway,
    @Inject(SmsGateway) private readonly sms: SmsGateway,
  ) {}

  async dispatchDue(limit = 100): Promise<number> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<NotificationRow>(
        `SELECT n.id, n.notification_event_id, n.recipient_user_id, n.channel, n.language, n.request_id, n.case_id, n.invitation_id, n.status, n.is_critical,
                n.rendered_title, n.rendered_body, n.scheduled_for, e.event_code::text AS event_code,
                (SELECT role_code FROM (SELECT r.code::text AS role_code FROM idn.user_role ur JOIN idn.role r ON r.id = ur.role_id
                  WHERE ur.user_id = n.recipient_user_id AND ur.status = 'Active'
                    AND EXISTS (SELECT 1 FROM ntf.notification_rule nr WHERE nr.event_code = e.event_code AND nr.recipient_role = r.code) LIMIT 1) x) AS role,
                (SELECT count(*)::int FROM ntf.delivery_attempt a WHERE a.notification_id = n.id) AS attempts
           FROM ntf.notification n JOIN ntf.notification_event e ON e.id = n.notification_event_id
          WHERE n.status IN ('Pending','Queued') AND n.scheduled_for <= now()
          ORDER BY n.is_critical DESC, n.scheduled_for LIMIT $1 FOR UPDATE OF n SKIP LOCKED`,
        [limit],
      );
      for (const n of rows) await this.process(tx, n);
      return rows.length;
    });
  }

  async fallbackDue(limit = 100): Promise<number> {
    return this.db.transaction(async (tx) => {
      const { rows } = await tx.query<{ id: string; notification_event_id: string; recipient_user_id: string; request_id: string | null; case_id: string | null; invitation_id: string | null;
        language: string; is_critical: boolean; event_code: string; urgency: string | null; role: string; rule: Rule }>(
        `SELECT n.id, n.notification_event_id, n.recipient_user_id, n.request_id, n.case_id, n.invitation_id, n.language::text, n.is_critical, e.event_code::text,
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
          ORDER BY n.is_critical DESC, n.created_at LIMIT $1 FOR UPDATE OF n SKIP LOCKED`,
        [limit],
      );
      let created = 0;
      for (const n of rows) created += await this.createSmsFallback(tx, n);
      return created;
    });
  }

  private async createSmsFallback(tx: Db, n: { id: string; notification_event_id: string; recipient_user_id: string; request_id: string | null; case_id: string | null; invitation_id: string | null; language: string; is_critical: boolean; event_code: string }): Promise<number> {
    const t = await tx.query<{ id: string; body: string }>(
      `SELECT v.id, v.body FROM ntf.notification_template t JOIN ntf.template_version v ON v.template_id = t.id AND v.status = 'Approved'
        WHERE t.event_code = $1::ntf_event_code AND t.channel = 'SMS' AND t.status = 'Active' ORDER BY (v.language = $2::ui_language) DESC LIMIT 1`,
      [n.event_code, n.language],
    );
    if (!t.rows[0]) return 0;
    const vars = await this.varsFor(tx, n.notification_event_id, n.language);
    const body = t.rows[0].body.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? '');
    const res = await tx.query(
      `INSERT INTO ntf.notification (notification_event_id, recipient_user_id, channel, template_version_id, language, request_id, case_id, invitation_id, fallback_of_id,
                                     dedupe_key, is_critical, rendered_body, scheduled_for)
       VALUES ($1, $2, 'SMS', $3, $4::ui_language, $5, $6, $7, $8, $9, $10, $11, now()) ON CONFLICT DO NOTHING`,
      [n.notification_event_id, n.recipient_user_id, t.rows[0].id, n.language, n.request_id, n.case_id, n.invitation_id, n.id, `fallback:${n.id}`, n.is_critical, body],
    );
    return res.rowCount ?? 0;
  }

  private async varsFor(tx: Db, eventId: string, language: string): Promise<Record<string, string>> {
    const { rows } = await tx.query<{ vars: Record<string, string> | null }>('SELECT payload -> \'varsByLang\' -> $2::text AS vars FROM ntf.notification_event WHERE id = $1', [eventId, language]);
    return rows[0]?.vars ?? {};
  }

  private async process(tx: Db, n: NotificationRow): Promise<void> {
    const rule = await this.rule(tx, n.event_code, n.role);
    const decision = await this.decide(tx, n, rule);
    if (decision.action === 'suppress') {
      await tx.query(`UPDATE ntf.notification SET status = 'Suppressed', suppression_reason = $2::suppression_reason, version = version + 1, updated_at = now() WHERE id = $1`, [n.id, decision.reason]);
      return;
    }
    if (decision.action === 'defer') {
      await tx.query(`UPDATE ntf.notification SET scheduled_for = $2, updated_at = now() WHERE id = $1`, [n.id, decision.until]);
      return;
    }
    if (decision.action === 'fail') {
      await this.recordAttempt(tx, n, rule, 'FAILED', decision.code, null, true);
      return;
    }
    try {
      await this.send(tx, n);
    } catch (error) {
      this.logger.warn(`send failed for ${n.id}: ${(error as Error).message}`);
      await this.recordAttempt(tx, n, rule, 'FAILED', 'SEND_ERROR', null, false);
    }
  }

  private async send(tx: Db, n: NotificationRow): Promise<void> {
    const attempt = n.attempts + 1;
    if (n.channel === 'IN_APP') {
      await tx.query(`INSERT INTO ntf.delivery_attempt (notification_id, attempt_no, provider, result, requested_at, result_at) VALUES ($1, $2, 'IN_APP', 'DELIVERED', now(), now())`, [n.id, attempt]);
      await tx.query(`UPDATE ntf.notification SET status = 'Delivered', sent_at = now(), delivered_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [n.id]);
      return;
    }
    if (n.channel === 'PUSH') {
      const devices = await tx.query<{ push_token: string; platform: string }>(
        `SELECT push_token, platform::text FROM idn.device WHERE user_id = $1 AND push_token IS NOT NULL AND sign_out_status = 'Active' AND revoked_at IS NULL`,
        [n.recipient_user_id],
      );
      const result = await this.push.send(devices.rows.map((d) => d.push_token), n.rendered_title ?? '', n.rendered_body ?? '', { notificationId: n.id, ...(n.request_id ? { requestId: n.request_id } : {}) });
      const provider = devices.rows[0]?.platform === 'ios' ? 'APNS' : 'FCM';
      await tx.query(
        `INSERT INTO ntf.delivery_attempt (notification_id, attempt_no, provider, provider_message_id, result, requested_at, result_at) VALUES ($1, $2, $3::delivery_provider, $4, 'ACCEPTED', now(), now())`,
        [n.id, attempt, provider, result.messageId],
      );
      await tx.query(`UPDATE ntf.notification SET status = 'Sent', sent_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [n.id]);
      return;
    }
    const phone = await tx.query<{ phone_e164: string }>('SELECT phone_e164 FROM idn.app_user WHERE id = $1', [n.recipient_user_id]);
    const result = await this.sms.send(phone.rows[0].phone_e164, n.rendered_body ?? '');
    await tx.query(
      `INSERT INTO ntf.delivery_attempt (notification_id, attempt_no, provider, provider_message_id, result, requested_at, result_at) VALUES ($1, $2, 'SMS_GATEWAY', $3, 'ACCEPTED', now(), now())`,
      [n.id, attempt, result.messageId],
    );
    await tx.query(`UPDATE ntf.notification SET status = 'Sent', sent_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [n.id]);
  }

  private async decide(tx: Db, n: NotificationRow, rule: Rule | null): Promise<Decision> {
    const suppressed = await tx.query(
      `SELECT 1 FROM ntf.suppression WHERE user_id = $1 AND (channel IS NULL OR channel = $2::notification_channel)
         AND (active_from IS NULL OR active_from <= now()) AND (active_until IS NULL OR active_until > now()) LIMIT 1`,
      [n.recipient_user_id, n.channel],
    );
    if (suppressed.rows[0]) return { action: 'suppress', reason: 'RECIPIENT_SUPPRESSED' };

    const pref = await tx.query<{ push_enabled: boolean; sms_enabled: boolean; inapp_enabled: boolean; quiet_start: string | null; quiet_end: string | null }>(
      'SELECT push_enabled, sms_enabled, inapp_enabled, quiet_start::text, quiet_end::text FROM idn.notification_preference WHERE user_id = $1 AND category = $2::notification_category',
      [n.recipient_user_id, categoryOf(n.event_code)],
    );
    const p = pref.rows[0];
    if (p) {
      if (n.channel === 'PUSH' && !p.push_enabled) return { action: 'suppress', reason: 'PREFERENCE_OFF' };
      if (n.channel === 'IN_APP' && !p.inapp_enabled) return { action: 'suppress', reason: 'PREFERENCE_OFF' };
      if (n.channel === 'SMS' && !p.sms_enabled) return { action: 'suppress', reason: 'PREFERENCE_OFF' };
    }
    if (n.channel !== 'IN_APP' && rule?.respects_quiet_hours && !n.is_critical && p?.quiet_start && p.quiet_end) {
      const until = quietUntil(new Date(), p.quiet_start, p.quiet_end);
      if (until) return { action: 'defer', until };
    }
    if (n.channel === 'PUSH') {
      const device = await tx.query("SELECT 1 FROM idn.device WHERE user_id = $1 AND push_token IS NOT NULL AND sign_out_status = 'Active' AND revoked_at IS NULL LIMIT 1", [n.recipient_user_id]);
      if (!device.rows[0]) return { action: 'fail', code: 'NO_PUSH_TOKEN' };
    }
    if (n.channel === 'SMS') {
      const consent = await tx.query("SELECT 1 FROM idn.consent_record WHERE user_id = $1 AND consent_type = 'CHANNEL_SMS' AND granted AND withdrawn_at IS NULL", [n.recipient_user_id]);
      if (!consent.rows[0]) return { action: 'suppress', reason: 'NO_CONSENT' };
      const cap = rule?.max_sms_per_request_per_day ?? 2;
      const sent = await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM ntf.notification WHERE recipient_user_id = $1 AND channel = 'SMS' AND request_id IS NOT DISTINCT FROM $2 AND status IN ('Sent','Delivered','Read') AND sent_at > now() - interval '1 day'`,
        [n.recipient_user_id, n.request_id],
      );
      if (sent.rows[0].n >= cap) return { action: 'suppress', reason: 'CONTACT_LIMIT' };
    }
    return { action: 'send' };
  }

  private async recordAttempt(tx: Db, n: NotificationRow, rule: Rule | null, result: 'FAILED', code: string, messageId: string | null, permanent: boolean): Promise<void> {
    const attempt = n.attempts + 1;
    const max = rule?.max_attempts ?? 3;
    const backoff = rule?.retry_backoff_seconds ?? [60, 300];
    await tx.query(
      `INSERT INTO ntf.delivery_attempt (notification_id, attempt_no, provider, provider_message_id, result, error_code, requested_at, result_at, next_retry_at)
       VALUES ($1, $2, $3::delivery_provider, $4, $5::delivery_result, $6, now(), now(), $7)`,
      [n.id, attempt, n.channel === 'SMS' ? 'SMS_GATEWAY' : n.channel === 'PUSH' ? 'FCM' : 'IN_APP', messageId, result, code,
        !permanent && attempt < max ? new Date(Date.now() + (backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 60) * 1000) : null],
    );
    if (!permanent && attempt < max) {
      const next = new Date(Date.now() + (backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 60) * 1000);
      await tx.query(`UPDATE ntf.notification SET status = 'Queued', queued_at = COALESCE(queued_at, now()), scheduled_for = $2, updated_at = now() WHERE id = $1`, [n.id, next]);
      return;
    }
    await tx.query(`UPDATE ntf.notification SET status = 'Failed', failed_at = now(), version = version + 1, updated_at = now() WHERE id = $1`, [n.id]);
    if (n.is_critical && n.request_id) await this.alertDeliveryFailure(tx, n);
  }

  private async alertDeliveryFailure(tx: Db, n: NotificationRow): Promise<void> {
    const targets = await tx.query<{ user_id: string; role: 'SUP' | 'ADM' }>(
      `SELECT c.owner_user_id AS user_id, 'SUP'::text AS role FROM crd.coordination_case c WHERE c.request_id = $1 AND c.owner_user_id IS NOT NULL
       UNION SELECT r.assigned_support_user_id, 'SUP' FROM req.blood_request r WHERE r.id = $1 AND r.assigned_support_user_id IS NOT NULL`,
      [n.request_id],
    );
    const reference = await tx.query<{ reference_no: string | null }>('SELECT reference_no FROM req.blood_request WHERE id = $1', [n.request_id]);
    await this.notifications.enqueue(tx, {
      eventCode: 'NTF-EV-18', aggregateType: 'NOTIFICATION', aggregateId: n.id, dedupeBase: `delivery-failed:${n.id}`,
      recipients: targets.rows.map((t) => ({ userId: t.user_id, role: 'SUP' as const })), requestId: n.request_id ?? undefined,
      vars: { ref: reference.rows[0]?.reference_no ?? '' },
    });
  }

  private async rule(tx: Db, eventCode: string, role: string | null): Promise<Rule | null> {
    if (!role) return null;
    const { rows } = await tx.query<Rule>(
      `SELECT max_attempts, retry_backoff_seconds, max_sms_per_request_per_day, respects_quiet_hours, sms_fallback_allowed, fallback_after_seconds
         FROM ntf.notification_rule WHERE event_code = $1::ntf_event_code AND recipient_role = $2::role_code`,
      [eventCode, role],
    );
    return rows[0] ?? null;
  }
}
