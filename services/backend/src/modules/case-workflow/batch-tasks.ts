import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { caseTask } from './schema';

const batchKey = (runId: string) => `batch:${runId}`;

export async function openBatchReviewTask(tx: Db, requestId: string, runId: string, assigneeUserId: string | null): Promise<void> {
  await tx.orm
    .insert(caseTask)
    .values({ requestId, taskType: 'TK_REVIEW_BATCH', status: 'Open', assigneeUserId, dedupeKey: batchKey(runId) })
    .onConflictDoNothing();
}

export async function cancelBatchReviewTask(tx: Db, runId: string): Promise<void> {
  await tx.orm
    .update(caseTask)
    .set({ status: 'Cancelled', version: sql`${caseTask.version} + 1`, updatedAt: sql`now()` })
    .where(and(eq(caseTask.dedupeKey, batchKey(runId)), inArray(caseTask.status, ['Open', 'In progress'])));
}

export async function completeBatchReviewTasks(tx: Db, requestId: string, userId: string): Promise<void> {
  await tx.orm
    .update(caseTask)
    .set({ status: 'Done', completedBy: userId, completedAt: sql`now()`, version: sql`${caseTask.version} + 1`, updatedAt: sql`now()` })
    .where(and(eq(caseTask.requestId, requestId), eq(caseTask.taskType, 'TK_REVIEW_BATCH'), ne(caseTask.status, 'Done')));
}
