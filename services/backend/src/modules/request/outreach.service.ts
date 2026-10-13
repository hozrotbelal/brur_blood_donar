import { HttpException, HttpStatus, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { staffAreaIds } from '../../platform/policy/area-scope';
import { PolicyService } from '../../platform/policy/policy.service';
import { Principal } from '../../platform/policy/policy.types';

const PAUSABLE = ['Verified', 'Searching', 'Donor coordination'];

interface Row {
  id: string;
  status: string;
  area_id: string | null;
  assigned_support_user_id: string | null;
  outreach_paused: boolean;
  version: number;
}

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
      const { rows } = await tx.query<Row>(
        `SELECT id, status::text AS status, area_id, assigned_support_user_id, outreach_paused, version
           FROM req.blood_request WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`,
        [requestId],
      );
      const row = rows[0];
      if (!row) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
      const decision = this.policy.decide(principal, 'outreach.pause', {
        resource: { assignedUserIds: row.assigned_support_user_id ? [row.assigned_support_user_id] : [], areaIds: row.area_id ? [row.area_id] : [] },
        principalAreaIds: await staffAreaIds(tx, principal.userId),
      });
      if (!decision.allowed) throw new NotFoundException({ code: 'REQUEST_NOT_FOUND' });
      if (pause) {
        if (!PAUSABLE.includes(row.status)) throw fail('INVALID_TRANSITION');
        if (row.outreach_paused) return { requestId, outreachPaused: true };
        await tx.query(
          `UPDATE req.blood_request SET outreach_paused = true, outreach_paused_reason = $2, outreach_paused_by = $3, outreach_paused_at = now(),
                  version = version + 1, updated_at = now() WHERE id = $1`,
          [requestId, reason, principal.userId],
        );
      } else {
        if (!row.outreach_paused) return { requestId, outreachPaused: false };
        await tx.query(
          `UPDATE req.blood_request SET outreach_paused = false, outreach_paused_reason = NULL, outreach_paused_by = NULL, outreach_paused_at = NULL,
                  version = version + 1, updated_at = now() WHERE id = $1`,
          [requestId],
        );
      }
      await this.outbox.append(tx, {
        aggregateType: 'BLOOD_REQUEST', aggregateId: requestId, eventType: pause ? 'OutreachPaused' : 'OutreachResumed',
        payload: { requestId, by: principal.userId, ...(pause ? { reason } : {}) }, version: row.version + 1,
      });
      return { requestId, outreachPaused: pause };
    });
  }
}
