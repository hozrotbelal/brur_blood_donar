import { inArray } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { bloodRequest } from './schema';

export interface RequestRouting {
  referenceNo: string | null;
  areaId: string | null;
  assignedSupportUserId: string | null;
}

export async function requestRouting(db: Db, ids: string[]): Promise<Map<string, RequestRouting>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await db.orm
    .select({ id: bloodRequest.id, referenceNo: bloodRequest.referenceNo, areaId: bloodRequest.areaId, assignedSupportUserId: bloodRequest.assignedSupportUserId })
    .from(bloodRequest)
    .where(inArray(bloodRequest.id, unique));
  return new Map(rows.map(({ id, ...rest }) => [id, rest]));
}
