"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateMachine = exports.InvalidTransitionError = void 0;
class InvalidTransitionError extends Error {
    from;
    to;
    constructor(from, to) {
        super(`Transition ${from} -> ${to} is not allowed`);
        this.from = from;
        this.to = to;
    }
}
exports.InvalidTransitionError = InvalidTransitionError;
class StateMachine {
    transitions;
    constructor(transitions) {
        this.transitions = transitions;
    }
    can(from, to) {
        return (this.transitions[from] ?? []).includes(to);
    }
    assert(from, to) {
        if (!this.can(from, to))
            throw new InvalidTransitionError(from, to);
    }
    isTerminal(state) {
        return (this.transitions[state] ?? []).length === 0;
    }
}
exports.StateMachine = StateMachine;
//# sourceMappingURL=state-machine.js.map