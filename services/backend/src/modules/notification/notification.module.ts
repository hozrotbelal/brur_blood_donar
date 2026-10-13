import { Module } from '@nestjs/common';
import { PushGateway, SimulatedPushGateway, SimulatedSmsGateway, SmsGateway } from './gateway.ports';
import { NotificationController } from './notification.controller';
import { NotificationDispatcher } from './notification.dispatcher';
import { NotificationPlanner } from './notification.planner';
import { NotificationService } from './notification.service';

@Module({
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationPlanner,
    NotificationDispatcher,
    { provide: PushGateway, useClass: SimulatedPushGateway },
    { provide: SmsGateway, useClass: SimulatedSmsGateway },
  ],
  exports: [NotificationService, NotificationDispatcher, NotificationPlanner],
})
export class NotificationModule {}
