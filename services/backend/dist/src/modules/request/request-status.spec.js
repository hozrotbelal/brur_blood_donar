"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request_status_1 = require("./request-status");
describe('request state machine', () => {
    it('lets a patient submit a draft', () => {
        const t = (0, request_status_1.findTransition)('Draft', 'submit');
        expect(t?.to).toBe('Submitted');
        expect((0, request_status_1.canActorRun)(t, 'PAT', 'Draft')).toBe(true);
        expect((0, request_status_1.canActorRun)(t, 'SUP', 'Draft')).toBe(false);
    });
    it('never allows a transition outside the table', () => {
        expect(request_status_1.requestStateMachine.can('Draft', 'Fulfilled')).toBe(false);
        expect(request_status_1.requestStateMachine.can('Verified', 'Fulfilled')).toBe(false);
        expect(() => request_status_1.requestStateMachine.assert('Closed', 'Searching')).toThrow();
    });
    it('treats Rejected, Cancelled, Unable to fulfil and Closed as terminal', () => {
        for (const s of ['Rejected', 'Cancelled', 'Unable to fulfil', 'Closed']) {
            expect(request_status_1.requestStateMachine.isTerminal(s)).toBe(true);
        }
        expect(request_status_1.requestStateMachine.isTerminal('Searching')).toBe(false);
    });
    it('only lets support cancel once the outcome is awaited, and not before it exists', () => {
        expect(request_status_1.requestStateMachine.can('Awaiting outcome', 'Cancelled')).toBe(false);
        const cancel = (0, request_status_1.findTransition)('Searching', 'cancel');
        expect((0, request_status_1.canActorRun)(cancel, 'PAT', 'Searching')).toBe(true);
        expect((0, request_status_1.canActorRun)(cancel, 'MOD', 'Searching')).toBe(false);
    });
    it('defines every status and only known ones', () => {
        for (const t of request_status_1.REQUEST_TRANSITIONS) {
            expect(request_status_1.REQUEST_STATUSES).toContain(t.from);
            expect(request_status_1.REQUEST_STATUSES).toContain(t.to);
        }
    });
    it('never accepts a donor self-report alone as fulfilment evidence', () => {
        expect((0, request_status_1.isFulfilmentEvidence)(['DONOR_SELF_REPORT'])).toBe(false);
        expect((0, request_status_1.isFulfilmentEvidence)(['DONOR_SELF_REPORT', 'COLLECTION_SERVICE_CONFIRMATION'])).toBe(true);
    });
});
//# sourceMappingURL=request-status.spec.js.map