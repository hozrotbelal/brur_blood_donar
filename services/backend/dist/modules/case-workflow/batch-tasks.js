"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openBatchReviewTask = openBatchReviewTask;
exports.cancelBatchReviewTask = cancelBatchReviewTask;
exports.completeBatchReviewTasks = completeBatchReviewTasks;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("./schema");
const batchKey = (runId) => `batch:${runId}`;
async function openBatchReviewTask(tx, requestId, runId, assigneeUserId) {
    await tx.orm
        .insert(schema_1.caseTask)
        .values({ requestId, taskType: 'TK_REVIEW_BATCH', status: 'Open', assigneeUserId, dedupeKey: batchKey(runId) })
        .onConflictDoNothing();
}
async function cancelBatchReviewTask(tx, runId) {
    await tx.orm
        .update(schema_1.caseTask)
        .set({ status: 'Cancelled', version: (0, drizzle_orm_1.sql) `${schema_1.caseTask.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseTask.dedupeKey, batchKey(runId)), (0, drizzle_orm_1.inArray)(schema_1.caseTask.status, ['Open', 'In progress'])));
}
async function completeBatchReviewTasks(tx, requestId, userId) {
    await tx.orm
        .update(schema_1.caseTask)
        .set({ status: 'Done', completedBy: userId, completedAt: (0, drizzle_orm_1.sql) `now()`, version: (0, drizzle_orm_1.sql) `${schema_1.caseTask.version} + 1`, updatedAt: (0, drizzle_orm_1.sql) `now()` })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.caseTask.requestId, requestId), (0, drizzle_orm_1.eq)(schema_1.caseTask.taskType, 'TK_REVIEW_BATCH'), (0, drizzle_orm_1.ne)(schema_1.caseTask.status, 'Done')));
}
//# sourceMappingURL=batch-tasks.js.map