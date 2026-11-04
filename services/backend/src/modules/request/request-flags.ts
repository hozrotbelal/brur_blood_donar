import { and, desc, eq, gt, ne, notInArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Db } from '../../platform/db/database.service';
import { bloodRequest, requestFlag } from './schema';

export const DUPLICATE_WINDOW_DAYS = 14;
export const RAPID_SUBMISSION_LIMIT = 3;
export const SHARED_CONTACT_PATIENTS = 3;

type FlagType = (typeof requestFlag.$inferSelect)['flagType'];

export async function detectFlags(tx: Db, requestId: string): Promise<string[]> {
  const found: string[] = [];
  const add = async (type: FlagType, matched: string | null, detail: Record<string, unknown>) => {
    const res = await tx.orm.insert(requestFlag).values({ requestId, flagType: type, matchedRequestId: matched, detail }).onConflictDoNothing();
    if (res.rowCount) found.push(type);
  };

  const r = alias(bloodRequest, 'r');
  const o = alias(bloodRequest, 'o');
  const dup = await tx.orm
    .select({ id: o.id, referenceNo: o.referenceNo })
    .from(r)
    .innerJoin(
      o,
      and(
        ne(o.id, r.id), sql`${o.deletedAt} is null`, notInArray(o.status, ['Draft', 'Rejected', 'Cancelled', 'Closed', 'Unable to fulfil']),
        eq(o.requestedBloodGroup, r.requestedBloodGroup), eq(o.component, r.component), gt(o.createdAt, sql`now() - make_interval(days => ${DUPLICATE_WINDOW_DAYS}::int)`),
        or(eq(o.patientId, r.patientId), and(sql`${o.contactPhone} is not null`, eq(o.contactPhone, r.contactPhone))),
      ),
    )
    .where(eq(r.id, requestId))
    .orderBy(desc(o.createdAt))
    .limit(5);
  for (const d of dup) await add('DUPLICATE_ACTIVE', d.id, { referenceNo: d.referenceNo });

  const [rapid] = await tx.orm
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(o)
    .innerJoin(r, eq(r.createdByUserId, o.createdByUserId))
    .where(and(eq(r.id, requestId), gt(o.submittedAt, sql`now() - interval '24 hours'`), ne(o.id, r.id)));
  if (rapid.n >= RAPID_SUBMISSION_LIMIT) await add('RAPID_SUBMISSION', null, { submittedLast24h: rapid.n + 1 });

  const [shared] = await tx.orm
    .select({ n: sql<number>`count(distinct ${o.patientId})`.mapWith(Number) })
    .from(r)
    .innerJoin(o, and(eq(o.contactPhone, r.contactPhone), gt(o.createdAt, sql`now() - interval '7 days'`)))
    .where(and(eq(r.id, requestId), sql`${r.contactPhone} is not null`));
  if (shared.n >= SHARED_CONTACT_PATIENTS) await add('SHARED_CONTACT', null, { patients: shared.n });
  return found;
}
