export class InvalidTransitionError extends Error {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transition ${from} -> ${to} is not allowed`);
  }
}

export class StateMachine<S extends string> {
  constructor(private readonly transitions: Readonly<Record<S, readonly S[]>>) {}

  can(from: S, to: S): boolean {
    return (this.transitions[from] ?? []).includes(to);
  }

  assert(from: S, to: S): void {
    if (!this.can(from, to)) throw new InvalidTransitionError(from, to);
  }

  isTerminal(state: S): boolean {
    return (this.transitions[state] ?? []).length === 0;
  }
}
