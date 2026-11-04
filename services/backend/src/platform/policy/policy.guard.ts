import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, Logger, SetMetadata, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { DatabaseService } from '../db/database.service';
import { PolicyService } from './policy.service';
import { Decision, PermissionScope, Principal } from './policy.types';

export const REQUIRE_PERMISSION = 'bbda:require-permission';

export interface RequiredPermission {
  key: string;
  minScope?: PermissionScope;
}

export const RequirePermission = (key: string, minScope?: PermissionScope) =>
  SetMetadata(REQUIRE_PERMISSION, [{ key, minScope }] satisfies RequiredPermission[]);

export const RequireAnyPermission = (...alternatives: RequiredPermission[]) => SetMetadata(REQUIRE_PERMISSION, alternatives);

@Injectable()
export class PolicyGuard implements CanActivate {
  private readonly logger = new Logger(PolicyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly policy: PolicyService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const required = this.reflector.getAllAndOverride<RequiredPermission[] | undefined>(REQUIRE_PERMISSION, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ principal?: Principal; method: string; url: string }>();
    if (!request.principal) throw new UnauthorizedException({ code: 'UNAUTHENTICATED' });

    const principal = request.principal;
    const decisions = required.map((r) => this.policy.decide(principal, r.key, { minScope: r.minScope }));
    if (decisions.some((d) => d.allowed)) return true;

    const stepUp = decisions.find((d) => d.reason === 'STEP_UP_REQUIRED');
    const denied = stepUp ?? decisions[0];
    await this.recordDenial(principal, denied, `${request.method} ${request.url.split('?')[0]}`);
    if (stepUp) throw new ForbiddenException({ code: 'STEP_UP_REQUIRED', permission: stepUp.permissionKey });
    throw new ForbiddenException({ code: 'FORBIDDEN', permission: denied.permissionKey });
  }

  private async recordDenial(principal: Principal, decision: Decision, endpoint: string): Promise<void> {
    try {
      await this.db.transaction((tx) =>
        this.audit.record(tx, {
          category: 'PERMISSION', action: 'PERMISSION_DENIED', result: 'DENIED', actorUserId: principal.userId, actorRole: principal.role,
          permissionUsed: decision.permissionKey, reasonCode: decision.reason, reasonText: endpoint, correlationId: randomUUID(),
        }),
      );
    } catch (error) {
      this.logger.warn(`could not record denied attempt: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
