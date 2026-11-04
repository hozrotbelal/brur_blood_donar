import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, count, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { DatabaseService, Db } from '../../platform/db/database.service';
import { caseOwnersForRequest } from '../case-workflow/read-model.public';
import { activePushDevices, channelPreference, hasSmsChannelConsent, phoneOf } from '../identity/read-model.public';
import { requestRouting } from '../request/read-model.public';
import { EventCode, NotificationService } from './notification.service';
import { categoryOf, Lang, NotificationRole, NotificationRow } from './notification.types';
import { PushGateway, SmsGateway } from './gateway.ports';
import { deliveryAttempt, notification, notificationEvent, notificationRule, suppression } from './schema';

interface Rule {
  maxAttempts: number;
  retryBackoffSeconds: number[];
  maxSmsPerRequestPerDay: number;
  respectsQuietHours: boolean;
}

type SuppressionReason = NonNullable<(typeof notification.$inferSelect)['suppressionReason']>;
type Provider = (typeof deliveryAttempt.$inferSelect)['provider'];

type Decision = { action: 'send' } | { action: 'suppress'; reason: SuppressionReason } | { action: 'defer'; until: Date } | { action: 'fail'; code: string };

interface FallbackRow {
  id: string;
  notification_event_id: string;
  recipient_user_id: string;
  request_id: string | null;
  case_id: string | null;
  invitation_id: string | null;
  language: Lang;
  is_critical: boolean;
  event_code: string;
}

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
      // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
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
      // Raw SQL: SKIP LOCKED worker loop (database-guidelines).
      const { rows } = await tx.query<FallbackRow>(
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

  private async createSmsFallback(tx: Db, n: FallbackRow): Promise<number> {
    const t = await this.notifications.template(tx, n.event_code as EventCode, 'SMS', n.language);
    if (!t) return 0;
    const vars = await this.varsFor(tx, n.notification_event_id, n.language);
    const body = t.body.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => vars[k] ?? '');
    const rows = await tx.orm
      .insert(notification)
      .values({
        notificationEventId: n.notification_event_id, recipientUserId: n.recipient_user_id, channel: 'SMS', templateVersionId: t.id, language: n.language,
        requestId: n.request_id, caseId: n.case_id, invitationId: n.invitation_id, fallbackOfId: n.id,
        dedupeKey: `fallback:${n.id}`, isCritical: n.is_critical, renderedBody: body, scheduledFor: sql`now()`,
      })
      .onConflictDoNothing()
      .returning({ id: notification.id });
    return rows.length;
  }

  private async varsFor(tx: Db, eventId: string, language: Lang): Promise<Record<string, string>> {
    const [row] = await tx.orm.select({ payload: notificationEvent.payload }).from(notificationEvent).where(eq(notificationEvent.id, eventId));
    const payload = row?.payload as { varsByLang?: Record<string, Record<string, string>> } | undefined;
    return payload?.varsByLang?.[language] ?? {};
  }

  private async process(tx: Db, n: NotificationRow): Promise<void> {
    const rule = await this.rule(tx, n.event_code, n.role);
    const decision = await this.decide(tx, n, rule);
    if (decision.action === 'suppress') {
      await tx.orm
        .update(notification)
        .set({ status: 'Suppressed', suppressionReason: decision.reason, version: sql`${notification.version} + 1`, updatedAt: sql`now()` })
        .where(eq(notification.id, n.id));
      return;
    }
    if (decision.action === 'defer') {
      await tx.orm.update(notification).set({ scheduledFor: decision.until, updatedAt: sql`now()` }).where(eq(notification.id, n.id));
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
      await tx.orm.insert(deliveryAttempt).values({ notificationId: n.id, attemptNo: attempt, provider: 'IN_APP', result: 'DELIVERED', requestedAt: sql`now()`, resultAt: sql`now()` });
      await tx.orm
        .update(notification)
        .set({ status: 'Delivered', sentAt: sql`now()`, deliveredAt: sql`now()`, version: sql`${notification.version} + 1`, updatedAt: sql`now()` })
        .where(eq(notification.id, n.id));
      return;
    }
    let provider: Provider = 'SMS_GATEWAY';
    let messageId: string;
    if (n.channel === 'PUSH') {
      const devices = await activePushDevices(tx, n.recipient_user_id);
      const result = await this.push.send(devices.map((d) => d.pushToken), n.rendered_title ?? '', n.rendered_body ?? '', { notificationId: n.id, ...(n.request_id ? { requestId: n.request_id } : {}) });
      provider = devices[0]?.platform === 'ios' ? 'APNS' : 'FCM';
      messageId = result.messageId;
    } else {
      const phone = await phoneOf(tx, n.recipient_user_id);
      messageId = (await this.sms.send(phone as string, n.rendered_body ?? '')).messageId;
    }
    await tx.orm.insert(deliveryAttempt).values({ notificationId: n.id, attemptNo: attempt, provider, providerMessageId: messageId, result: 'ACCEPTED', requestedAt: sql`now()`, resultAt: sql`now()` });
    await tx.orm
      .update(notification)
      .set({ status: 'Sent', sentAt: sql`now()`, version: sql`${notification.version} + 1`, updatedAt: sql`now()` })
      .where(eq(notification.id, n.id));
  }

  private async decide(tx: Db, n: NotificationRow, rule: Rule | null): Promise<Decision> {
    const [suppressed] = await tx.orm
      .select({ id: suppression.id })
      .from(suppression)
      .where(and(
        eq(suppression.userId, n.recipient_user_id), or(isNull(suppression.channel), eq(suppression.channel, n.channel)),
        or(isNull(suppression.activeFrom), lte(suppression.activeFrom, sql`now()`)), or(isNull(suppression.activeUntil), gt(suppression.activeUntil, sql`now()`)),
      ))
      .limit(1);
    if (suppressed) return { action: 'suppress', reason: 'RECIPIENT_SUPPRESSED' };

    const p = await channelPreference(tx, n.recipient_user_id, categoryOf(n.event_code));
    if (p) {
      if (n.channel === 'PUSH' && !p.pushEnabled) return { action: 'suppress', reason: 'PREFERENCE_OFF' };
      if (n.channel === 'IN_APP' && !p.inappEnabled) return { action: 'suppress', reason: 'PREFERENCE_OFF' };
      if (n.channel === 'SMS' && !p.smsEnabled) return { action: 'suppress', reason: 'PREFERENCE_OFF' };
    }
    if (n.channel !== 'IN_APP' && rule?.respectsQuietHours && !n.is_critical && p?.quietStart && p.quietEnd) {
      const until = quietUntil(new Date(), p.quietStart, p.quietEnd);
      if (until) return { action: 'defer', until };
    }
    if (n.channel === 'PUSH' && (await activePushDevices(tx, n.recipient_user_id)).length === 0) return { action: 'fail', code: 'NO_PUSH_TOKEN' };
    if (n.channel === 'SMS') {
      if (!(await hasSmsChannelConsent(tx, n.recipient_user_id))) return { action: 'suppress', reason: 'NO_CONSENT' };
      const cap = rule?.maxSmsPerRequestPerDay ?? 2;
      const [sent] = await tx.orm
        .select({ n: count() })
        .from(notification)
        .where(and(
          eq(notification.recipientUserId, n.recipient_user_id), eq(notification.channel, 'SMS'), sql`${notification.requestId} IS NOT DISTINCT FROM ${n.request_id}`,
          inArray(notification.status, ['Sent', 'Delivered', 'Read']), sql`${notification.sentAt} > now() - interval '1 day'`,
        ));
      if (sent.n >= cap) return { action: 'suppress', reason: 'CONTACT_LIMIT' };
    }
    return { action: 'send' };
  }

  private async recordAttempt(tx: Db, n: NotificationRow, rule: Rule | null, result: 'FAILED', code: string, messageId: string | null, permanent: boolean): Promise<void> {
    const attempt = n.attempts + 1;
    const max = rule?.maxAttempts ?? 3;
    const backoff = rule?.retryBackoffSeconds ?? [60, 300];
    const next = !permanent && attempt < max ? new Date(Date.now() + (backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 60) * 1000) : null;
    await tx.orm.insert(deliveryAttempt).values({
      notificationId: n.id, attemptNo: attempt, provider: n.channel === 'SMS' ? 'SMS_GATEWAY' : n.channel === 'PUSH' ? 'FCM' : 'IN_APP', providerMessageId: messageId,
      result, errorCode: code, requestedAt: sql`now()`, resultAt: sql`now()`, nextRetryAt: next,
    });
    if (next) {
      await tx.orm
        .update(notification)
        .set({ status: 'Queued', queuedAt: sql`COALESCE(${notification.queuedAt}, now())`, scheduledFor: next, updatedAt: sql`now()` })
        .where(eq(notification.id, n.id));
      return;
    }
    await tx.orm
      .update(notification)
      .set({ status: 'Failed', failedAt: sql`now()`, version: sql`${notification.version} + 1`, updatedAt: sql`now()` })
      .where(eq(notification.id, n.id));
    if (n.is_critical && n.request_id) await this.alertDeliveryFailure(tx, n, n.request_id);
  }

  private async alertDeliveryFailure(tx: Db, n: NotificationRow, requestId: string): Promise<void> {
    const request = (await requestRouting(tx, [requestId])).get(requestId);
    const targets = new Set(await caseOwnersForRequest(tx, requestId));
    if (request?.assignedSupportUserId) targets.add(request.assignedSupportUserId);
    await this.notifications.enqueue(tx, {
      eventCode: 'NTF-EV-18', aggregateType: 'NOTIFICATION', aggregateId: n.id, dedupeBase: `delivery-failed:${n.id}`,
      recipients: [...targets].map((userId) => ({ userId, role: 'SUP' as const })), requestId,
      vars: { ref: request?.referenceNo ?? '' },
    });
  }

  private async rule(tx: Db, eventCode: string, role: NotificationRole | null): Promise<Rule | null> {
    if (!role) return null;
    const [row] = await tx.orm
      .select({
        maxAttempts: notificationRule.maxAttempts, retryBackoffSeconds: notificationRule.retryBackoffSeconds,
        maxSmsPerRequestPerDay: notificationRule.maxSmsPerRequestPerDay, respectsQuietHours: notificationRule.respectsQuietHours,
      })
      .from(notificationRule)
      .where(and(eq(notificationRule.eventCode, eventCode as EventCode), eq(notificationRule.recipientRole, role)));
    return row ?? null;
  }
}
