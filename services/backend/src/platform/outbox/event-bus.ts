export interface DomainEvent {
  id: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export type EventHandler = (event: DomainEvent) => Promise<void>;

export class EventBus {
  private readonly handlers = new Map<string, EventHandler[]>();

  subscribe(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, [...(this.handlers.get(eventType) ?? []), handler]);
  }

  async publish(event: DomainEvent): Promise<void> {
    for (const handler of this.handlers.get(event.eventType) ?? []) {
      await handler(event);
    }
  }
}
