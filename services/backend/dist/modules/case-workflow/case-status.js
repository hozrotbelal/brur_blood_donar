"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIVE_CASE_STATUSES = exports.appointmentStateMachine = exports.APPOINTMENT_STATUSES = exports.caseStateMachine = exports.CASE_STATUSES = void 0;
const state_machine_1 = require("../../platform/status/state-machine");
exports.CASE_STATUSES = [
    'Open', 'Scheduling', 'Scheduled', 'Attendance pending', 'Outcome pending', 'Resolved', 'Closed', 'Needs replacement',
];
exports.caseStateMachine = new state_machine_1.StateMachine({
    Open: ['Scheduling', 'Needs replacement', 'Resolved'],
    Scheduling: ['Scheduled', 'Needs replacement', 'Resolved'],
    Scheduled: ['Scheduling', 'Attendance pending', 'Needs replacement', 'Resolved'],
    'Attendance pending': ['Outcome pending', 'Needs replacement', 'Resolved'],
    'Outcome pending': ['Resolved', 'Open'],
    Resolved: ['Closed'],
    Closed: [],
    'Needs replacement': ['Open', 'Resolved'],
});
exports.APPOINTMENT_STATUSES = [
    'Proposed', 'Confirmed', 'Rescheduled', 'Checked-in', 'Attended (reported)', 'No-show', 'Cancelled',
];
exports.appointmentStateMachine = new state_machine_1.StateMachine({
    Proposed: ['Confirmed', 'Rescheduled', 'Cancelled'],
    Confirmed: ['Rescheduled', 'Checked-in', 'Attended (reported)', 'No-show', 'Cancelled'],
    Rescheduled: [],
    'Checked-in': ['Attended (reported)'],
    'Attended (reported)': [],
    'No-show': [],
    Cancelled: [],
});
exports.LIVE_CASE_STATUSES = ['Open', 'Scheduling', 'Scheduled', 'Attendance pending', 'Outcome pending', 'Needs replacement'];
//# sourceMappingURL=case-status.js.map