import { Db } from '../db/database.service';

export async function staffAreaIds(db: Db, userId: string): Promise<string[]> {
  const { rows } = await db.query<{ area_id: string }>(
    `SELECT s.area_id FROM idn.permission_scope s JOIN idn.user_role ur ON ur.id = s.user_role_id
      WHERE ur.user_id = $1 AND ur.status = 'Active' AND s.revoked_at IS NULL AND s.area_id IS NOT NULL`,
    [userId],
  );
  return rows.map((r) => r.area_id);
}
