"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const case_status_1 = require("../src/modules/case-workflow/case-status");
describe('case state machines', () => {
    it('allows the planned case path and refuses shortcuts', () => {
        expect(case_status_1.caseStateMachine.can('Open', 'Scheduling')).toBe(true);
        expect(case_status_1.caseStateMachine.can('Scheduling', 'Scheduled')).toBe(true);
        expect(case_status_1.caseStateMachine.can('Scheduled', 'Attendance pending')).toBe(true);
        expect(case_status_1.caseStateMachine.can('Resolved', 'Closed')).toBe(true);
        expect(case_status_1.caseStateMachine.can('Open', 'Closed')).toBe(false);
        expect(case_status_1.caseStateMachine.can('Closed', 'Open')).toBe(false);
    });
    it('keeps appointment states one-way once an appointment has ended', () => {
        expect(case_status_1.appointmentStateMachine.can('Proposed', 'Confirmed')).toBe(true);
        expect(case_status_1.appointmentStateMachine.can('Confirmed', 'No-show')).toBe(true);
        expect(case_status_1.appointmentStateMachine.can('No-show', 'Confirmed')).toBe(false);
    });
});
//# sourceMappingURL=case-status.spec.js.map