import { Module } from '@nestjs/common';
import { CaseModule } from '../case-workflow/case-workflow.public';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { InvitationController } from './invitation.controller';
import { InvitationService } from './invitation.service';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';

@Module({
  imports: [CaseModule],
  controllers: [MatchingController, InvitationController],
  providers: [MatchingService, InvitationService, StatusHistoryService],
  exports: [MatchingService, InvitationService],
})
export class MatchingModule {}
