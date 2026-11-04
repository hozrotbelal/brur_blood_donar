import { inArray } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { facility } from './schema';

export interface FacilityName {
  nameEn: string;
  nameBn: string | null;
}

export async function facilityNames(db: Db, ids: string[]): Promise<Map<string, FacilityName>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.orm.select({ id: facility.id, nameEn: facility.nameEn, nameBn: facility.nameBn }).from(facility).where(inArray(facility.id, unique));
  return new Map(rows.map((row) => [row.id, { nameEn: row.nameEn, nameBn: row.nameBn }]));
}
