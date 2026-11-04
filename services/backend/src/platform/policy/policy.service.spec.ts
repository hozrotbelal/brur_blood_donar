import { PolicyService } from './policy.service';
import { Principal } from './policy.types';

const principal = (grants: Principal['grants']): Principal => ({ userId: 'u1', role: 'SUP', grants });

describe('PolicyService', () => {
  const policy = new PolicyService();

  it('denies when no grant exists', () => {
    expect(policy.decide(principal([]), 'request.view').reason).toBe('NO_GRANT');
  });

  it('allows a grant and uses the widest scope', () => {
    const p = principal([
      { key: 'request.view', scope: 'Own' },
      { key: 'request.view', scope: 'Area' },
    ]);
    expect(policy.decide(p, 'request.view', { minScope: 'Area' }).allowed).toBe(true);
    expect(policy.decide(p, 'request.view', { minScope: 'All' }).reason).toBe('SCOPE_TOO_NARROW');
  });

  it('ignores expired grants', () => {
    const p = principal([{ key: 'request.view', scope: 'All', expiresAt: new Date('2020-01-01') }]);
    expect(policy.decide(p, 'request.view').allowed).toBe(false);
  });

  it('checks the resource against Own, Assigned and Area scopes', () => {
    const own = principal([{ key: 'k', scope: 'Own' }]);
    expect(policy.decide(own, 'k', { resource: { ownerUserId: 'u1' } }).allowed).toBe(true);
    expect(policy.decide(own, 'k', { resource: { ownerUserId: 'u2' } }).reason).toBe('RESOURCE_OUT_OF_SCOPE');

    const assigned = principal([{ key: 'k', scope: 'Assigned' }]);
    expect(policy.decide(assigned, 'k', { resource: { assignedUserIds: ['u1'] } }).allowed).toBe(true);

    const area = principal([{ key: 'k', scope: 'Area' }]);
    expect(policy.decide(area, 'k', { resource: { areaIds: ['a1'] }, principalAreaIds: ['a1'] }).allowed).toBe(true);
    expect(policy.decide(area, 'k', { resource: { areaIds: ['a2'] }, principalAreaIds: ['a1'] }).allowed).toBe(false);
    expect(policy.decide(area, 'k', { resource: { areaIds: ['a2'], assignedUserIds: ['u1'] }, principalAreaIds: ['a1'] }).allowed).toBe(true);
    expect(policy.decide(area, 'k', { resource: { areaIds: ['a2'], assignedUserIds: ['someone-else'] }, principalAreaIds: ['a1'] }).allowed).toBe(false);
  });

  it('requires a fresh step-up for sensitive permissions', () => {
    const sensitive = principal([{ key: 'permission.manage', scope: 'All', requiresStepUp: true }]);
    expect(policy.decide(sensitive, 'permission.manage').reason).toBe('STEP_UP_REQUIRED');
    expect(policy.decide({ ...sensitive, stepUpAt: new Date(Date.now() - 10 * 60_000) }, 'permission.manage').reason).toBe('STEP_UP_REQUIRED');
    expect(policy.decide({ ...sensitive, stepUpAt: new Date(Date.now() - 60_000) }, 'permission.manage').allowed).toBe(true);
    expect(policy.decide(principal([{ key: 'k', scope: 'Own' }]), 'k', { resource: { ownerUserId: 'u1' } }).allowed).toBe(true);
  });
});
