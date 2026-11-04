"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestStateMachine = exports.REQUEST_TRANSITIONS = exports.REQUEST_STATUSES = void 0;
exports.findTransition = findTransition;
exports.canActorRun = canActorRun;
exports.isFulfilmentEvidence = isFulfilmentEvidence;
const state_machine_1 = require("../../platform/status/state-machine");
exports.REQUEST_STATUSES = [
    'Draft', 'Submitted', 'Under review', 'Needs information', 'Verified', 'Searching',
    'Donor coordination', 'Awaiting outcome', 'Partially fulfilled', 'Fulfilled', 'Closed',
    'Rejected', 'Cancelled', 'Unable to fulfil',
];
const CANCELLABLE = [
    'Draft', 'Submitted', 'Under review', 'Needs information', 'Verified', 'Searching', 'Donor coordination',
];
exports.REQUEST_TRANSITIONS = [
    { from: 'Draft', to: 'Submitted', command: 'submit', actors: ['PAT'] },
    { from: 'Submitted', to: 'Under review', command: 'pick_up', actors: ['SUP', 'SYSTEM'] },
    { from: 'Under review', to: 'Needs information', command: 'request_information', actors: ['SUP'] },
    { from: 'Needs information', to: 'Under review', command: 'supply_information', actors: ['PAT'] },
    { from: 'Under review', to: 'Verified', command: 'verify', actors: ['SUP'] },
    { from: 'Under review', to: 'Rejected', command: 'reject', actors: ['SUP', 'MOD'] },
    { from: 'Needs information', to: 'Rejected', command: 'reject', actors: ['SUP', 'MOD'] },
    { from: 'Verified', to: 'Searching', command: 'start_search', actors: ['SYSTEM'] },
    { from: 'Searching', to: 'Donor coordination', command: 'first_available_response', actors: ['SYSTEM'] },
    { from: 'Donor coordination', to: 'Searching', command: 'withdrawal_or_no_show', actors: ['SYSTEM', 'SUP'] },
    { from: 'Donor coordination', to: 'Awaiting outcome', command: 'attendance_reported', actors: ['SYSTEM', 'SUP'] },
    { from: 'Awaiting outcome', to: 'Partially fulfilled', command: 'record_partial_outcome', actors: ['SUP'] },
    { from: 'Awaiting outcome', to: 'Fulfilled', command: 'record_full_outcome', actors: ['SUP'] },
    { from: 'Partially fulfilled', to: 'Searching', command: 'more_donors_needed', actors: ['SUP'] },
    { from: 'Partially fulfilled', to: 'Closed', command: 'close', actors: ['SUP'] },
    { from: 'Fulfilled', to: 'Closed', command: 'close', actors: ['SUP'] },
    { from: 'Searching', to: 'Unable to fulfil', command: 'declare_unable', actors: ['SUP'] },
    { from: 'Donor coordination', to: 'Unable to fulfil', command: 'declare_unable', actors: ['SUP'] },
    { from: 'Partially fulfilled', to: 'Unable to fulfil', command: 'declare_unable', actors: ['SUP'] },
    ...CANCELLABLE.map((from) => ({ from, to: 'Cancelled', command: 'cancel', actors: ['PAT', 'SUP'] })),
];
const table = Object.fromEntries(exports.REQUEST_STATUSES.map((s) => [s, []]));
for (const t of exports.REQUEST_TRANSITIONS)
    table[t.from].push(t.to);
exports.requestStateMachine = new state_machine_1.StateMachine(table);
function findTransition(from, command) {
    return exports.REQUEST_TRANSITIONS.find((t) => t.from === from && t.command === command);
}
function canActorRun(transition, actor, from) {
    if (!transition.actors.includes(actor))
        return false;
    if (transition.command === 'cancel' && actor === 'PAT')
        return from !== 'Awaiting outcome';
    return true;
}
function isFulfilmentEvidence(sources) {
    return sources.some((s) => s !== 'DONOR_SELF_REPORT');
}
//# sourceMappingURL=request-status.js.map