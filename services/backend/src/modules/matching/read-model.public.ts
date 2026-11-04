import { eq, sql } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { invitation } from './schema';

export interface SearchCounts {
  contacted: number;
  responded: number;
  willing: number;
}

export async function searchCountsForRequest(db: Db, requestId: string): Promise<SearchCounts> {
  const [row] = await db.orm
    .select({
      contacted: sql<number>`count(*) filter (where ${invitation.sentAt} is not null)`.mapWith(Number),
      responded: sql<number>`count(*) filter (where ${invitation.respondedAt} is not null)`.mapWith(Number),
      willing: sql<number>`count(*) filter (where ${invitation.response} = 'Available' and ${invitation.status} <> 'Withdrawn')`.mapWith(Number),
    })
    .from(invitation)
    .where(eq(invitation.requestId, requestId));
  return { contacted: row?.contacted ?? 0, responded: row?.responded ?? 0, willing: row?.willing ?? 0 };
}
