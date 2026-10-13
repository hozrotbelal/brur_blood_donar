import { Module } from '@nestjs/common';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { OutreachService } from './outreach.service';
import { RequestController } from './request.controller';
import { RequestService } from './request.service';
import { ReviewController } from './review.controller';
import { ReviewService } from './review.service';

@Module({
  controllers: [RequestController, ReviewController],
  providers: [OutreachService, RequestService, ReviewService, StatusHistoryService],
})
export class RequestModule {}
