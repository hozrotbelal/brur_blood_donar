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
  });
});
