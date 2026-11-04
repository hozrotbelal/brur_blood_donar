import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { staffAreaIds } from '../../platform/policy/area-scope';
import { PolicyService } from '../../platform/policy/policy.service';
import { Principal } from '../../platform/policy/policy.types';
import { bloodRequest } from './schema';

const PAUSABLE = ['Verified', 'Searching', 'Donor coordination'];

const fail = (code: string, status = HttpStatus.UNPROCESSABLE_ENTITY) => new HttpException({ code }, status);

@Injectable()
export class OutreachService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly policy: PolicyService,
    private readonly outbox: OutboxService,
  ) {}

  pause(principal: Principal, requestId: string, reason: string) {
    return this.change(principal, requestId, true, reason);
  }

  resume(principal: Principal, requestId: string) {
    return this.change(principal, requestId, false);
  }

  private change(principal: Principal, requestId: string, pause: boolean, reason?: string) {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.orm
        .select({ id: bloodRequest.id, status: bloodRequest.status, areaId: bloodRequest.areaId, assignedSupportUserId: bloodRequest.assignedSupportUserId, outreachPaused: bloodRequest.outreachPaused, version: bloodRequest.version })
        .from(bloodRequest)
        .where(and(eq(bloodRequest.id, requestId), isNull(bloodRequest.deletedAt)))
        .for('update');
      if (!row) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
      const decision = this.policy.decide(principal, 'outreach.pause', {
        resource: { assignedUserIds: row.assignedSupportUserId ? [row.assignedSupportUserId] : [], areaIds: row.areaId ? [row.areaId] : [] },
        principalAreaIds: await staffAreaIds(tx, principal.userId),
      });
      if (!decision.allowed) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
      if (pause) {
        if (!PAUSABLE.includes(row.status)) throw fail('INVALID_TRANSITION');
        if (row.outreachPaused) return { requestId, outreachPaused: true };
        await tx.orm
          .update(bloodRequest)
          .set({ outreachPaused: true, outreachPausedReason: reason, outreachPausedBy: principal.userId, outreachPausedAt: new Date(), version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() })
          .where(eq(bloodRequest.id, requestId));
      } else {
        if (!row.outreachPaused) return { requestId, outreachPaused: false };
        await tx.orm
          .update(bloodRequest)
          .set({ outreachPaused: false, outreachPausedReason: null, outreachPausedBy: null, outreachPausedAt: null, version: sql`${bloodRequest.version} + 1`, updatedAt: new Date() })
          .where(eq(bloodRequest.id, requestId));
      }
      await this.outbox.append(tx, {
        aggregateType: 'BLOOD_REQUEST', aggregateId: requestId, eventType: pause ? 'OutreachPaused' : 'OutreachResumed',
        payload: { requestId, by: principal.userId, ...(pause ? { reason } : {}) }, version: row.version + 1,
      });
      return { requestId, outreachPaused: pause };
    });
  }
}
