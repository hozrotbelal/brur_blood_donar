import { Injectable } from '@nestjs/common';
import { Decision, PermissionScope, Principal, Resource, SCOPE_ORDER } from './policy.types';

const rank = (scope: PermissionScope) => SCOPE_ORDER.indexOf(scope);

@Injectable()
export class PolicyService {
  decide(
    principal: Principal,
    key: string,
    options: { minScope?: PermissionScope; resource?: Resource; principalAreaIds?: string[]; now?: Date } = {},
  ): Decision {
    const now = options.now ?? new Date();
    const live = principal.grants.filter(
      (g) => g.key === key && (!g.expiresAt || g.expiresAt.getTime() > now.getTime()),
    );
    if (live.length === 0) return { allowed: false, permissionKey: key, reason: 'NO_GRANT' };

    const widest = live.reduce((a, b) => (rank(a.scope) >= rank(b.scope) ? a : b)).scope;
    if (options.minScope && rank(widest) < rank(options.minScope)) {
      return { allowed: false, permissionKey: key, reason: 'SCOPE_TOO_NARROW' };
    }
    if (options.resource && !this.resourceInScope(principal, widest, options.resource, options.principalAreaIds)) {
      return { allowed: false, permissionKey: key, reason: 'RESOURCE_OUT_OF_SCOPE' };
    }
    return { allowed: true, permissionKey: key, reason: 'GRANTED' };
  }

  authorize(principal: Principal, key: string, options: Parameters<PolicyService['decide']>[2] = {}): Decision {
    return this.decide(principal, key, options);
  }

  private resourceInScope(
    principal: Principal,
    scope: PermissionScope,
    resource: Resource,
    principalAreaIds: string[] = [],
  ): boolean {
    switch (scope) {
      case 'All':
        return true;
      case 'Area':
        return (resource.areaIds ?? []).some((a) => principalAreaIds.includes(a));
      case 'Assigned':
        return (resource.assignedUserIds ?? []).includes(principal.userId);
      case 'Own':
        return resource.ownerUserId === principal.userId;
    }
  }
}
