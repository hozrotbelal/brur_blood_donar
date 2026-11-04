"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.staffAreaIds = staffAreaIds;
// Raw SQL: a recursive walk down cfg.area. A scoped area also covers every area below it (OI-37).
async function staffAreaIds(db, userId) {
    const { rows } = await db.query(`WITH RECURSIVE covered AS (
       SELECT s.area_id AS id FROM idn.permission_scope s JOIN idn.user_role ur ON ur.id = s.user_role_id
        WHERE ur.user_id = $1 AND ur.status = 'Active' AND s.revoked_at IS NULL AND s.area_id IS NOT NULL
       UNION
       SELECT a.id FROM cfg.area a JOIN covered c ON a.parent_id = c.id
     )
     SELECT id FROM covered`, [userId]);
    return rows.map((r) => r.id);
}
//# sourceMappingURL=area-scope.js.map