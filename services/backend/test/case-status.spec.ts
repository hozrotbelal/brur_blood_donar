import { appointmentStateMachine, caseStateMachine } from '../src/modules/case-workflow/case-status';

describe('case state machines', () => {
  it('allows the planned case path and refuses shortcuts', () => {
    expect(caseStateMachine.can('Open', 'Scheduling')).toBe(true);
    expect(caseStateMachine.can('Scheduling', 'Scheduled')).toBe(true);
    expect(caseStateMachine.can('Scheduled', 'Attendance pending')).toBe(true);
    expect(caseStateMachine.can('Resolved', 'Closed')).toBe(true);
    expect(caseStateMachine.can('Open', 'Closed')).toBe(false);
    expect(caseStateMachine.can('Closed', 'Open')).toBe(false);
  });

  it('keeps appointment states one-way once an appointment has ended', () => {
    expect(appointmentStateMachine.can('Proposed', 'Confirmed')).toBe(true);
    expect(appointmentStateMachine.can('Confirmed', 'No-show')).toBe(true);
    expect(appointmentStateMachine.can('No-show', 'Confirmed')).toBe(false);
  });
});
