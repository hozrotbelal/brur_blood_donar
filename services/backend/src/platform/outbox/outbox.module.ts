import { Global, Module } from '@nestjs/common';
import { EventBus } from './event-bus';
import { OutboxRelay } from './outbox.relay';
import { OutboxService } from './outbox.service';

@Global()
@Module({
  providers: [OutboxService, OutboxRelay, EventBus],
  exports: [OutboxService, OutboxRelay, EventBus],
})
export class OutboxModule {}
