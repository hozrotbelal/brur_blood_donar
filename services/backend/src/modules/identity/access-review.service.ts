import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, eq, gte, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../platform/audit/audit.service';
import { DatabaseService } from '../../platform/db/database.service';
import { OutboxService } from '../../platform/outbox/outbox.service';
import { Principal } from '../../platform/policy/policy.types';
import { searchCountsByActor } from '../matching/read-model.public';
import { permission, permissionSet, permissionSetItem, sensitiveAccessGrant, userPermissionSet } from './schema';
import { AccessReviewDto, AccessReviewGrantDto, GrantDecisionDto, PermissionSetViewDto } from './staff.dto';
import { StaffService } from './staff.service';

const DHAKA_OFFSET_MS = 6 * 3_600_000;
const REVIEWED_KINDS = ['SCOPE', 'CUSTOM'] as const;

export function monthWindow(month?: string, now = new Date()): { month: string; from: Date; to: Date } {
  const local = new Date(now.getTime() + DHAKA_OFFSET_MS);
  const [y, m] = month ? month.split('-').map(Number) : [local.getUTCFullYear(), local.getUTCMonth() + 1];
  const from = new Date(Date.UTC(y, m - 1, 1) - DHAKA_OFFSET_MS);
  const to = new Date(Date.UTC(y, m, 1) - DHAKA_OFFSET_MS);
  return { month: `${y}-${String(m).padStart(2, '0')}`, from, to };
}

@Injectable()
export class AccessReviewService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    private readonly staff: StaffService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async permissionSets(): Promise<PermissionSetViewDto[]> {
    const rows = await this.db.orm
      .select({
        setId: permissionSet.id, code: permissionSet.code, nameEn: permissionSet.nameEn, nameBn: permissionSet.nameBn, roleCode: permissionSet.roleCode,
        kind: permissionSet.kind, tierRank: permissionSet.tierRank, key: permission.key, scope: permissionSetItem.scope, descriptionEn: permission.descriptionEn,
        descriptionBn: permission.descriptionBn, sensitive: permission.isSensitive, requiresStepUp: permission.requiresStepUp,
      })
      .from(permissionSet)
      .innerJoin(permissionSetItem, eq(permissionSetItem.permissionSetId, permissionSet.id))
      .innerJoin(permission, eq(permission.id, permissionSetItem.permissionId))
      .where(eq(permissionSet.status, 'Active'))
      .orderBy(asc(permissionSet.roleCode), asc(permissionSet.tierRank), asc(permissionSet.code), asc(permission.key));
    const sets = new Map<string, PermissionSetViewDto>();
    for (const r of rows) {
      const set = sets.get(r.setId) ?? { code: r.code, nameEn: r.nameEn, nameBn: r.nameBn, roleCode: r.roleCode, kind: r.kind, tierRank: r.tierRank, items: [] };
      set.items.push({ key: r.key, scope: r.scope, descriptionEn: r.descriptionEn, descriptionBn: r.descriptionBn, sensitive: r.sensitive, requiresStepUp: r.requiresStepUp });
      sets.set(r.setId, set);
    }
    return [...sets.values()];
  }

  async review(month?: string): Promise<AccessReviewDto> {
    const window = monthWindow(month);
    const members = (await this.staff.staffList()).filter((s) => s.status !== 'Deactivated');
    const ids = members.map((m) => m.userId);
    if (ids.length === 0) return { month: window.month, members: [] };

    const sensitiveKeys = this.db.orm
      .select({ setId: permissionSetItem.permissionSetId })
      .from(permissionSetItem)
      .innerJoin(permission, and(eq(permission.id, permissionSetItem.permissionId), eq(permission.isSensitive, true)));
    const grants = await this.db.orm
      .select({
        grantId: userPermissionSet.id, userId: userPermissionSet.userId, setId: permissionSet.id, setCode: permissionSet.code, setNameEn: permissionSet.nameEn,
        setNameBn: permissionSet.nameBn, kind: permissionSet.kind, expiresAt: userPermissionSet.expiresAt, lastReviewedAt: userPermissionSet.lastReviewedAt,
      })
      .from(userPermissionSet)
      .innerJoin(permissionSet, eq(permissionSet.id, userPermissionSet.permissionSetId))
      .where(and(
        inArray(userPermissionSet.userId, ids), eq(userPermissionSet.status, 'Active'), inArray(permissionSet.kind, [...REVIEWED_KINDS]),
        or(isNotNull(userPermissionSet.expiresAt), inArray(permissionSet.id, sensitiveKeys)),
      ));
    const setIds = [...new Set(grants.map((g) => g.setId))];
    const keys = setIds.length
      ? await this.db.orm
          .select({ setId: permissionSetItem.permissionSetId, key: permission.key })
          .from(permissionSetItem)
          .innerJoin(permission, and(eq(permission.id, permissionSetItem.permissionId), eq(permission.isSensitive, true)))
          .where(inArray(permissionSetItem.permissionSetId, setIds))
      : [];
    const reveals = await this.db.orm
      .select({ userId: sensitiveAccessGrant.granteeUserId, n: count() })
      .from(sensitiveAccessGrant)
      .where(and(inArray(sensitiveAccessGrant.granteeUserId, ids), gte(sensitiveAccessGrant.grantedAt, window.from), lt(sensitiveAccessGrant.grantedAt, window.to)))
      .groupBy(sensitiveAccessGrant.granteeUserId);
    const searches = await searchCountsByActor(this.db, ids, window.from, window.to);

    return {
      month: window.month,
      members: members.map((m) => ({
        userId: m.userId, displayName: m.displayName, roleCode: m.roleCode, tierCode: m.tierCode,
        reveals: reveals.find((r) => r.userId === m.userId)?.n ?? 0,
        searches: searches.get(m.userId) ?? 0,
        grants: grants
          .filter((g) => g.userId === m.userId)
          .map((g): AccessReviewGrantDto => ({
            grantId: g.grantId, setCode: g.setCode, setNameEn: g.setNameEn, setNameBn: g.setNameBn, kind: g.kind, expiresAt: g.expiresAt,
            sensitiveKeys: keys.filter((k) => k.setId === g.setId).map((k) => k.key),
            ...(g.lastReviewedAt && g.lastReviewedAt >= window.from && g.lastReviewedAt < window.to
              ? { decision: 'KEEP', decidedAt: g.lastReviewedAt }
              : { decision: null, decidedAt: null }),
          })),
      })),
    };
  }

  async decide(principal: Principal, grantId: string, dto: GrantDecisionDto) {
    return this.db.transaction(async (tx) => {
      const [grant] = await tx.orm
        .select({ userId: userPermissionSet.userId, kind: permissionSet.kind })
        .from(userPermissionSet)
        .innerJoin(permissionSet, eq(permissionSet.id, userPermissionSet.permissionSetId))
        .where(and(eq(userPermissionSet.id, grantId), eq(userPermissionSet.status, 'Active'), inArray(permissionSet.kind, [...REVIEWED_KINDS])))
        .for('update');
      if (!grant) throw new NotFoundException({ code: 'GRANT_NOT_FOUND' });
      await this.staff.assertCanManage(tx, principal.userId, grant.userId);
      if (dto.decision === 'REVOKE') {
        await tx.orm
          .update(userPermissionSet)
          .set({ status: 'Revoked', revokedBy: principal.userId, revokedAt: new Date(), revokeReason: dto.reason, version: sql`${userPermissionSet.version} + 1`, updatedAt: new Date() })
          .where(eq(userPermissionSet.id, grantId));
        await this.outbox.append(tx, { aggregateType: 'APP_USER', aggregateId: grant.userId, eventType: 'PermissionRevoked', payload: { grantId, by: principal.userId } });
      } else {
        await tx.orm
          .update(userPermissionSet)
          .set({ lastReviewedAt: new Date(), lastReviewedBy: principal.userId, updatedAt: new Date() })
          .where(eq(userPermissionSet.id, grantId));
      }
      await this.audit.record(tx, {
        category: 'PERMISSION', action: dto.decision === 'REVOKE' ? 'PERMISSION_REVOKED' : 'APPROVE', result: 'SUCCESS', actorUserId: principal.userId,
        actorRole: 'ADM', entityType: 'user_permission_set', entityId: grantId, subjectUserId: grant.userId,
        reasonCode: `ACCESS_REVIEW_${dto.decision}`, reasonText: dto.reason, correlationId: randomUUID(),
      });
      return { grantId, decision: dto.decision };
    });
  }
}
