import { eq, sql } from 'drizzle-orm';
import { Db } from '../../platform/db/database.service';
import { donorProfile } from './schema';

export async function touchDonorResponse(tx: Db, donorProfileId: string): Promise<void> {
  await tx.orm
    .update(donorProfile)
    .set({ lastResponseAt: sql`now()`, version: sql`${donorProfile.version} + 1`, updatedAt: sql`now()` })
    .where(eq(donorProfile.id, donorProfileId));
}
