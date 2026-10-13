import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { DatabaseService } from '../../platform/db/database.service';
import { DomainEvent, EventBus } from '../../platform/outbox/event-bus';

export interface OutcomeRecordedPayload {
  outcomeId: string;
  caseDonorId: string | null;
  donorProfileId: string | null;
  outcomeType: string;
  sourceType: string;
  confidence: string;
  reportedAt: string;
}

const DONATION_SOURCE_BY_OUTCOME_SOURCE: Record<string, string> = {
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

    await this.db.transaction(async (tx) => {
      const inserted = await tx.query<{ id: string; donation_date: string }>(
        `INSERT INTO idn.donation_record
           (donor_profile_id, donation_date, source, verified, verification_status, case_donor_id, outcome_update_id, counts_for_next_contact)
         VALUES ($1, ($2::timestamptz AT TIME ZONE 'Asia/Dhaka')::date, $3::donation_source, true, 'Service-confirmed', $4, $5, true)
         ON CONFLICT (case_donor_id) DO NOTHING
         RETURNING id, donation_date::text AS donation_date`,
        [p.donorProfileId, p.reportedAt, source, p.caseDonorId, p.outcomeId],
      );
      const record = inserted.rows[0];
      if (!record) return;

      await tx.query(
        `UPDATE idn.donor_profile
            SET last_donation_date = GREATEST(last_donation_date, $2::date), version = version + 1, updated_at = now()
          WHERE id = $1`,
        [p.donorProfileId, record.donation_date],
      );
      await this.audit.record(tx, {
        category: 'DATA_CHANGE',
        action: 'DonationRecorded',
        result: 'SUCCESS',
        actorUserId: null,
        actorRole: 'SYSTEM',
        entityType: 'DONATION_RECORD',
        entityId: record.id,
        correlationId: randomUUID(),
        changes: { source, donationDate: record.donation_date, outcomeId: p.outcomeId },
      });
    });
  }
}
