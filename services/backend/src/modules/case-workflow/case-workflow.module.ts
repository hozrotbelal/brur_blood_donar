import { Module } from '@nestjs/common';
import { StatusHistoryService } from '../../platform/status/status-history.service';
import { AppointmentService } from './appointment.service';
import { CaseController, DonorAppointmentController } from './case.controller';
import { CaseService } from './case.service';
import { CaseSupport } from './case.support';
import { OutcomeService } from './outcome.service';

@Module({
  controllers: [CaseController, DonorAppointmentController],
  providers: [CaseService, AppointmentService, OutcomeService, CaseSupport, StatusHistoryService],
  exports: [CaseService],
})
export class CaseModule {}
