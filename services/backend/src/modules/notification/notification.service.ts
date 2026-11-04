import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from 'drizzle-orm';
import { Db, DatabaseService } from '../../platform/db/database.service';
import { staffAreaIds } from '../../platform/policy/area-scope';
import { Principal } from '../../platform/policy/policy.types';
import { setPushToken } from '../identity/identity.public';
import { preferredLanguage } from '../identity/read-model.public';
import { requestRouting } from '../request/read-model.public';
import { categoryOf, EnqueueInput, Lang, Vars } from './notification.types';
import { deliveryAttempt, notification, notificationEvent, notificationRule, notificationTemplate, templateVersion } from './schema';
import { render } from './template.renderer';

export type EventCode = (typeof notificationEvent.$inferSelect)['eventCode'];
type Channel = (typeof notification.$inferSelect)['channel'];

const KEEP_ON_CLOSE: EventCode[] = ['NTF-EV-09', 'NTF-EV-13', 'NTF-EV-18'];
const REPORT_PAGE = 200;

@Injectable()
export class NotificationService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  async enqueue(tx: Db, input: EnqueueInput): Promise<number> {
    const eventCode = input.eventCode as EventCode;
    const [event] = await tx.orm
      .insert(notificationEvent)
      .values({
        eventCode, aggregateType: input.aggregateType, aggregateId: input.aggregateId, requestId: input.requestId ?? null, caseId: input.caseId ?? null,
        payload: { urgency: input.urgency ?? null, varsByLang: { bn: this.varsFor(input, 'bn'), en: this.varsFor(input, 'en') } },
        sourceOutboxEventId: input.sourceOutboxEventId ?? null,
      })
      .onConflictDoUpdate({ target: notificationEvent.sourceOutboxEventId, set: { updatedAt: sql`now()` } })
      .returning({ id: notificationEvent.id });
    let created = 0;
    const seen = new Set<string>();
    for (const r of input.recipients) {
      const key = `${r.userId}:${r.role}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const [rule] = await tx.orm
        .select({ channels: notificationRule.channels, isCritical: notificationRule.isCritical })
        .from(notificationRule)
        .where(and(eq(notificationRule.eventCode, eventCode), eq(notificationRule.recipientRole, r.role), eq(notificationRule.enabled, true)));
      if (!rule) continue;
      const lang = await preferredLanguage(tx, r.userId);
      if (!lang) continue;
      const vars = this.varsFor(input, lang);
      const critical = rule.isCritical || (input.eventCode === 'NTF-EV-04' && input.urgency === 'Critical');
      for (const channel of rule.channels.filter((c) => c !== 'SMS')) {
        const text = await this.template(tx, eventCode, channel, lang);
        if (!text) continue;
        const inserted = await tx.orm
          .insert(notification)
          .values({
            notificationEventId: event.id, recipientUserId: r.userId, channel, templateVersionId: text.id, language: lang,
            requestId: input.requestId ?? null, caseId: input.caseId ?? null, invitationId: input.invitationId ?? null,
            dedupeKey: `${input.dedupeBase}:${r.userId}:${channel}`, isCritical: critical,
            renderedTitle: text.title ? render(text.title, vars) : null, renderedBody: render(text.body, vars), scheduledFor: input.scheduledFor ?? new Date(),
          })
          .onConflictDoNothing({ target: notification.dedupeKey })
          .returning({ id: notification.id });
        created += inserted.length;
      }
    }
    await tx.orm
      .update(notificationEvent)
      .set({ status: created > 0 ? 'Processed' : 'Skipped', updatedAt: sql`now()` })
      .where(eq(notificationEvent.id, event.id));
    return created;
  }

  async cancelForRequest(tx: Db, requestId: string, reason: 'REQUEST_CLOSED' | 'OUTREACH_PAUSED' | 'SUPERSEDED' = 'REQUEST_CLOSED'): Promise<number> {
    const cancellable = tx.orm.select({ id: notificationEvent.id }).from(notificationEvent).where(notInArray(notificationEvent.eventCode, KEEP_ON_CLOSE));
    const rows = await tx.orm
      .update(notification)
      .set({ status: 'Cancelled', cancelReason: reason, cancelledAt: sql`now()`, version: sql`${notification.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(notification.requestId, requestId), inArray(notification.status, ['Pending', 'Queued']), inArray(notification.notificationEventId, cancellable)))
      .returning({ id: notification.id });
    return rows.length;
  }

  async inbox(principal: Principal, opts: { unreadOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const rows = await this.db.orm
      .select({
        id: notification.id, eventCode: notificationEvent.eventCode, title: notification.renderedTitle, body: notification.renderedBody,
        createdAt: notification.createdAt, readAt: notification.readAt, requestId: notification.requestId, invitationId: notification.invitationId, critical: notification.isCritical,
      })
      .from(notification)
      .innerJoin(notificationEvent, eq(notificationEvent.id, notification.notificationEventId))
      .where(and(
        eq(notification.recipientUserId, principal.userId), eq(notification.channel, 'IN_APP'), inArray(notification.status, ['Delivered', 'Read']),
        opts.unreadOnly ? isNull(notification.readAt) : undefined,
      ))
      .orderBy(desc(notification.createdAt))
      .limit(limit);
    return rows.map(({ readAt, ...r }) => ({
      id: r.id, eventCode: r.eventCode, category: categoryOf(r.eventCode), title: r.title, body: r.body, createdAt: r.createdAt, read: readAt !== null,
      requestId: r.requestId, invitationId: r.invitationId, critical: r.critical,
    }));
  }

  async unreadCount(principal: Principal) {
    const [row] = await this.db.orm
      .select({ n: count() })
      .from(notification)
      .where(and(eq(notification.recipientUserId, principal.userId), eq(notification.channel, 'IN_APP'), eq(notification.status, 'Delivered'), isNull(notification.readAt)));
    return { unread: row.n };
  }

  async markRead(principal: Principal, id: string) {
    const rows = await this.db.orm
      .update(notification)
      .set({
        status: 'Read', readAt: sql`COALESCE(${notification.readAt}, now())`, deliveredAt: sql`COALESCE(${notification.deliveredAt}, now())`,
        version: sql`${notification.version} + 1`, updatedAt: sql`now()`,
      })
      .where(and(eq(notification.id, id), eq(notification.recipientUserId, principal.userId), inArray(notification.status, ['Sent', 'Delivered', 'Read'])))
      .returning({ eventId: notification.notificationEventId });
    if (!rows[0]) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    await this.markCompanionsRead(id, rows[0].eventId, principal.userId);
    return { id, read: true };
  }

  async markAllRead(principal: Principal) {
    const rows = await this.db.orm
      .update(notification)
      .set({ status: 'Read', readAt: sql`now()`, version: sql`${notification.version} + 1`, updatedAt: sql`now()` })
      .where(and(eq(notification.recipientUserId, principal.userId), eq(notification.channel, 'IN_APP'), eq(notification.status, 'Delivered')))
      .returning({ id: notification.id });
    return { updated: rows.length };
  }

  async receipt(principal: Principal, id: string) {
    const rows = await this.db.orm
      .update(notification)
      .set({
        status: sql`CASE WHEN ${notification.status} = 'Sent' THEN 'Delivered'::notification_status ELSE ${notification.status} END`,
        deliveredAt: sql`COALESCE(${notification.deliveredAt}, now())`, updatedAt: sql`now()`,
      })
      .where(and(eq(notification.id, id), eq(notification.recipientUserId, principal.userId), eq(notification.channel, 'PUSH'), inArray(notification.status, ['Sent', 'Delivered', 'Read'])))
      .returning({ id: notification.id });
    if (!rows[0]) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND' });
    return { id, delivered: true };
  }

  async registerPushToken(principal: Principal, installId: string, token: string) {
    if (!(await setPushToken(this.db, principal.userId, installId, token))) throw new NotFoundException({ code: 'DEVICE_NOT_FOUND' });
    return { registered: true };
  }

  async deliveryReport(principal: Principal, scope: 'Area' | 'All', days = 7) {
    const areas = scope === 'Area' ? new Set(await staffAreaIds(this.db, principal.userId)) : null;
    if (areas && areas.size === 0) throw new HttpException({ code: 'FORBIDDEN' }, HttpStatus.FORBIDDEN);
    const report = [];
    for (let offset = 0; report.length < REPORT_PAGE; offset += REPORT_PAGE) {
      const rows = await this.db.orm
        .select({
          id: notification.id, eventCode: notificationEvent.eventCode, channel: notification.channel, status: notification.status, critical: notification.isCritical,
          requestId: notification.requestId, failedAt: notification.failedAt,
          attempts: sql<number>`(SELECT count(*)::int FROM ${deliveryAttempt} WHERE ${deliveryAttempt.notificationId} = ${notification.id})`,
        })
        .from(notification)
        .innerJoin(notificationEvent, eq(notificationEvent.id, notification.notificationEventId))
        .where(and(
          inArray(notification.status, ['Failed', 'Suppressed']), sql`${notification.updatedAt} > now() - make_interval(days => ${days}::int)`,
          areas ? isNotNull(notification.requestId) : undefined,
        ))
        .orderBy(desc(notification.isCritical), desc(notification.updatedAt), desc(notification.id))
        .limit(REPORT_PAGE)
        .offset(offset);
      const routing = await requestRouting(this.db, rows.flatMap((r) => (r.requestId ? [r.requestId] : [])));
      for (const r of rows) {
        const request = r.requestId ? routing.get(r.requestId) : undefined;
        if (areas && !(request?.areaId && areas.has(request.areaId))) continue;
        if (report.length < REPORT_PAGE) report.push({ ...r, requestReference: request?.referenceNo ?? null });
      }
      if (!areas || rows.length < REPORT_PAGE) break;
    }
    return report;
  }

  private async markCompanionsRead(id: string, eventId: string, userId: string) {
    await this.db.orm
      .update(notification)
      .set({ readAt: sql`COALESCE(${notification.readAt}, now())`, updatedAt: sql`now()` })
      .where(and(eq(notification.notificationEventId, eventId), eq(notification.recipientUserId, userId), ne(notification.id, id)));
  }

  private varsFor(input: EnqueueInput, lang: Lang): Vars {
    return typeof input.vars === 'function' ? input.vars(lang) : input.vars;
  }

  async template(db: Db, eventCode: EventCode, channel: Channel, lang: Lang) {
    const [row] = await db.orm
      .select({ id: templateVersion.id, title: templateVersion.title, body: templateVersion.body })
      .from(notificationTemplate)
      .innerJoin(templateVersion, and(eq(templateVersion.templateId, notificationTemplate.id), eq(templateVersion.status, 'Approved')))
      .where(and(eq(notificationTemplate.eventCode, eventCode), eq(notificationTemplate.channel, channel), eq(notificationTemplate.status, 'Active')))
      .orderBy(desc(sql`${templateVersion.language} = ${lang}`))
      .limit(1);
    return row ?? null;
  }
}
