import {
  REQUEST_STATUSES,
  REQUEST_TRANSITIONS,
  canActorRun,
  findTransition,
  isFulfilmentEvidence,
  requestStateMachine,
} from './request-status';

describe('request state machine', () => {
  it('lets a patient submit a draft', () => {
    const t = findTransition('Draft', 'submit');
    expect(t?.to).toBe('Submitted');
    expect(canActorRun(t!, 'PAT', 'Draft')).toBe(true);
    expect(canActorRun(t!, 'SUP', 'Draft')).toBe(false);
  });

  it('never allows a transition outside the table', () => {
    expect(requestStateMachine.can('Draft', 'Fulfilled')).toBe(false);
    expect(requestStateMachine.can('Verified', 'Fulfilled')).toBe(false);
    expect(() => requestStateMachine.assert('Closed', 'Searching')).toThrow();
  });

  it('treats Rejected, Cancelled, Unable to fulfil and Closed as terminal', () => {
    for (const s of ['Rejected', 'Cancelled', 'Unable to fulfil', 'Closed'] as const) {
      expect(requestStateMachine.isTerminal(s)).toBe(true);
    }
    expect(requestStateMachine.isTerminal('Searching')).toBe(false);
  });

  it('only lets support cancel once the outcome is awaited, and not before it exists', () => {
    expect(requestStateMachine.can('Awaiting outcome', 'Cancelled')).toBe(false);
    const cancel = findTransition('Searching', 'cancel')!;
    expect(canActorRun(cancel, 'PAT', 'Searching')).toBe(true);
    expect(canActorRun(cancel, 'MOD', 'Searching')).toBe(false);
  });

  it('defines every status and only known ones', () => {
    for (const t of REQUEST_TRANSITIONS) {
      expect(REQUEST_STATUSES).toContain(t.from);
      expect(REQUEST_STATUSES).toContain(t.to);
    }
  });

  it('never accepts a donor self-report alone as fulfilment evidence', () => {
    expect(isFulfilmentEvidence(['DONOR_SELF_REPORT'])).toBe(false);
    expect(isFulfilmentEvidence(['DONOR_SELF_REPORT', 'COLLECTION_SERVICE_CONFIRMATION'])).toBe(true);
  });
});
