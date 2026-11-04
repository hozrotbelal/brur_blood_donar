import { and, desc, eq, inArray, isNotNull, notInArray } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { coordinationCase, outcomeUpdate } from './schema';

export type OutcomeConfidence = 'Self-reported' | 'Service-confirmed';

export async function latestOutcomeConfidence(db: Db, requestIds: string[]): Promise<Map<string, OutcomeConfidence>> {
  const result = new Map<string, OutcomeConfidence>();
  if (requestIds.length === 0) return result;
  const rows = await db.orm
    .select({ requestId: outcomeUpdate.requestId, confidence: outcomeUpdate.confidence })
    .from(outcomeUpdate)
    .where(and(inArray(outcomeUpdate.requestId, requestIds), eq(outcomeUpdate.isDisputed, false)))
    .orderBy(desc(outcomeUpdate.reportedAt));
  for (const row of rows) if (!result.has(row.requestId)) result.set(row.requestId, row.confidence);
  return result;
}

export async function caseOwnersForRequest(db: Db, requestId: string): Promise<string[]> {
  const rows = await db.orm
    .select({ ownerUserId: coordinationCase.ownerUserId })
    .from(coordinationCase)
    .where(and(eq(coordinationCase.requestId, requestId), isNotNull(coordinationCase.ownerUserId)));
  return [...new Set(rows.map((r) => r.ownerUserId as string))];
}

export async function openCasesOwnedBy(db: Db, userId: string): Promise<{ id: string; caseNo: string; requestId: string }[]> {
  return db.orm
    .select({ id: coordinationCase.id, caseNo: coordinationCase.caseNo, requestId: coordinationCase.requestId })
    .from(coordinationCase)
    .where(and(eq(coordinationCase.ownerUserId, userId), notInArray(coordinationCase.status, ['Resolved', 'Closed'])));
}
