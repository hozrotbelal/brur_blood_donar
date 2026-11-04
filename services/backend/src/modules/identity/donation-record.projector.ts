import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { DatabaseService } from '../../platform/db/database.service';
import { DomainEvent, EventBus } from '../../platform/outbox/event-bus';
import { donationRecord, donorProfile } from './schema';

export interface OutcomeRecordedPayload {
  outcomeId: string;
  caseDonorId: string | null;
  donorProfileId: string | null;
  outcomeType: string;
  sourceType: string;
  confidence: string;
  reportedAt: string;
}

type DonationSource = (typeof donationRecord.$inferSelect)['source'];

const DONATION_SOURCE_BY_OUTCOME_SOURCE: Record<string, DonationSource> = {
  COLLECTION_SERVICE_CONFIRMATION: 'COLLECTION_SERVICE_CONFIRMATION',
  PARTNER_INTEGRATION: 'PARTNER_INTEGRATION',
};

@Injectable()
export class DonationRecordProjector implements OnModuleInit {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(EventBus) private readonly bus: EventBus,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    this.bus.subscribe('OutcomeRecorded', (event) => this.handle(event));
  }

  async handle(event: DomainEvent): Promise<void> {
    const p = event.payload as unknown as OutcomeRecordedPayload;
    const source = DONATION_SOURCE_BY_OUTCOME_SOURCE[p.sourceType];
    if (p.outcomeType !== 'DONATION_COMPLETED' || p.confidence !== 'Service-confirmed' || !source) return;
    if (!p.caseDonorId || !p.donorProfileId) return;
    const donorProfileId = p.donorProfileId;

    await this.db.transaction(async (tx) => {
      const [record] = await tx.orm
        .insert(donationRecord)
        .values({
          donorProfileId, donationDate: sql`(${p.reportedAt}::timestamptz at time zone 'Asia/Dhaka')::date`, source, verified: true,
          verificationStatus: 'Service-confirmed', caseDonorId: p.caseDonorId, outcomeUpdateId: p.outcomeId, countsForNextContact: true,
        })
        .onConflictDoNothing({ target: donationRecord.caseDonorId })
        .returning({ id: donationRecord.id, donationDate: donationRecord.donationDate });
      if (!record) return;

      await tx.orm
        .update(donorProfile)
        .set({ lastDonationDate: sql`greatest(${donorProfile.lastDonationDate}, ${record.donationDate}::date)`, version: sql`${donorProfile.version} + 1`, updatedAt: new Date() })
        .where(eq(donorProfile.id, donorProfileId));
      await this.audit.record(tx, {
        category: 'DATA_CHANGE',
        action: 'DonationRecorded',
        result: 'SUCCESS',
        actorUserId: null,
        actorRole: 'SYSTEM',
        entityType: 'DONATION_RECORD',
        entityId: record.id,
        correlationId: randomUUID(),
        changes: { source, donationDate: record.donationDate, outcomeId: p.outcomeId },
      });
    });
  }
}
