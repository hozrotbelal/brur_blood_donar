import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { EventBus } from '../../platform/outbox/event-bus';
import { MatchingService } from './matching.service';

@Injectable()
export class ChangeRecheckSubscriber implements OnModuleInit {
  constructor(
    @Inject(EventBus) private readonly bus: EventBus,
    private readonly matching: MatchingService,
  ) {}

  onModuleInit() {
    this.bus.subscribe('RequestChangeApproved', async (event) => {
      await this.matching.recheckAfterChange(event.aggregateId);
    });
  }
}
