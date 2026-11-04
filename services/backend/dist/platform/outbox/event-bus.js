"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
class EventBus {
    handlers = new Map();
    subscribe(eventType, handler) {
        this.handlers.set(eventType, [...(this.handlers.get(eventType) ?? []), handler]);
    }
    async publish(event) {
        for (const handler of this.handlers.get(event.eventType) ?? []) {
            await handler(event);
        }
    }
}
exports.EventBus = EventBus;
//# sourceMappingURL=event-bus.js.map