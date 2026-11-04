import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { AppointmentService } from './appointment.service';
import {
  CloseCaseDto, ContactAttemptDto, DeclareUnableDto, DisputeOutcomeDto, ResolveDisputeDto, MoreDonorsDto, NoteDto, ProposeAppointmentDto, RecordOutcomeDto, RescheduleDto,
  TimingProblemDto,
} from './case.dto';
import { CaseListItemDto } from './case-list.dto';
import {
  CaseDetailDto, CaseStateDto, CreatedIdDto, DisputeResolutionDto, DisputeResultDto, FulfilmentResultDto, OutcomeRecordedDto, RequestStatusResultDto, StaffAppointmentDto,
} from './case-detail.dto';
import { CaseService } from './case.service';
import { OutcomeService } from './outcome.service';
import { DonorAppointmentDto } from './appointment-view.dto';

interface Req {
  principal: Principal;
}

@ApiTags('cases')
@ApiBearerAuth()
@Controller('staff')
export class CaseController {
  constructor(
    private readonly cases: CaseService,
    private readonly appointments: AppointmentService,
    private readonly outcomes: OutcomeService,
  ) {}

  @Get('cases') @RequirePermission('case.view', 'Assigned') @ApiOkResponse({ type: [CaseListItemDto] })
  list(@Req() req: Req) {
    return this.cases.list(req.principal);
  }

  @Get('cases/:id') @RequirePermission('case.view', 'Assigned') @ApiOkResponse({ type: CaseDetailDto })
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.cases.detail(req.principal, id);
  }

  @Post('cases/:id/start-scheduling') @HttpCode(200) @RequirePermission('case.edit', 'Assigned') @ApiOkResponse({ type: CaseStateDto })
  start(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.cases.startScheduling(req.principal, id);
  }

  @Post('cases/:id/notes') @HttpCode(201) @RequirePermission('case.edit', 'Assigned') @ApiCreatedResponse({ type: CreatedIdDto })
  note(@Param('id', ParseUUIDPipe) id: string, @Body() dto: NoteDto, @Req() req: Req) {
    return this.cases.addNote(req.principal, id, dto);
  }

  @Post('cases/:id/contact-attempts') @HttpCode(201) @RequirePermission('case.edit', 'Assigned') @ApiCreatedResponse({ type: CreatedIdDto })
  contact(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ContactAttemptDto, @Req() req: Req) {
    return this.cases.logContact(req.principal, id, dto);
  }

  @Post('cases/:id/appointments') @HttpCode(201) @RequirePermission('appointment.create', 'Assigned') @ApiCreatedResponse({ type: StaffAppointmentDto })
  propose(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProposeAppointmentDto, @Req() req: Req) {
    return this.appointments.propose(req.principal, id, dto);
  }

  @Post('appointments/:id/reschedule') @HttpCode(200) @RequirePermission('appointment.edit', 'Assigned') @ApiOkResponse({ type: StaffAppointmentDto })
  reschedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RescheduleDto, @Req() req: Req) {
    return this.appointments.reschedule(req.principal, id, dto);
  }

  @Post('appointments/:id/no-show') @HttpCode(200) @RequirePermission('appointment.edit', 'Assigned') @ApiOkResponse({ type: StaffAppointmentDto })
  noShow(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.appointments.recordNoShow(req.principal, id);
  }

  @Post('cases/:id/outcomes') @HttpCode(201) @RequirePermission('outcome.report', 'Assigned') @ApiCreatedResponse({ type: OutcomeRecordedDto })
  outcome(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RecordOutcomeDto, @Req() req: Req) {
    return this.outcomes.record(req.principal, id, dto);
  }

  @Post('cases/:id/outcomes/:outcomeId/dispute') @HttpCode(200) @RequirePermission('case.edit', 'Assigned') @ApiOkResponse({ type: DisputeResultDto })
  dispute(@Param('id', ParseUUIDPipe) id: string, @Param('outcomeId', ParseUUIDPipe) outcomeId: string, @Body() dto: DisputeOutcomeDto, @Req() req: Req) {
    return this.outcomes.dispute(req.principal, id, outcomeId, dto);
  }

  @Post('cases/:id/outcomes/:outcomeId/resolve-dispute') @HttpCode(200) @RequirePermission('case.edit', 'Assigned') @ApiOkResponse({ type: DisputeResolutionDto })
  resolveDispute(@Param('id', ParseUUIDPipe) id: string, @Param('outcomeId', ParseUUIDPipe) outcomeId: string, @Body() dto: ResolveDisputeDto, @Req() req: Req) {
    return this.outcomes.resolveDispute(req.principal, id, outcomeId, dto);
  }

  @Post('cases/:id/fulfilment') @HttpCode(200) @RequirePermission('case.edit', 'Assigned') @ApiOkResponse({ type: FulfilmentResultDto })
  fulfilment(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.outcomes.setFulfilment(req.principal, id);
  }

  @Post('cases/:id/more-donors') @HttpCode(200) @RequirePermission('case.edit', 'Assigned') @ApiOkResponse({ type: RequestStatusResultDto })
  moreDonors(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoreDonorsDto, @Req() req: Req) {
    return this.outcomes.moreDonors(req.principal, id, dto.needed);
  }

  @Post('requests/:id/declare-unable') @HttpCode(200) @RequirePermission('case.edit', 'Assigned') @ApiOkResponse({ type: RequestStatusResultDto })
  declareUnable(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeclareUnableDto, @Req() req: Req) {
    return this.outcomes.declareUnable(req.principal, id, dto.reason);
  }

  @Post('cases/:id/close') @HttpCode(200) @RequirePermission('case.edit', 'Assigned') @ApiOkResponse({ type: CaseStateDto })
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseCaseDto, @Req() req: Req) {
    return this.cases.close(req.principal, id, dto.note);
  }
}

@ApiTags('appointments')
@ApiBearerAuth()
@Controller('appointments')
export class DonorAppointmentController {
  constructor(private readonly appointments: AppointmentService) {}

  @Get() @RequirePermission('appointment.view', 'Own') @ApiResponse({ status: 200, type: [DonorAppointmentDto] })
  list(@Req() req: Req) {
    return this.appointments.listForDonor(req.principal);
  }

  @Post(':id/confirm') @HttpCode(200) @RequirePermission('appointment.edit', 'Own') @ApiOkResponse({ type: StaffAppointmentDto })
  confirm(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.appointments.confirm(req.principal, id);
  }

  @Post(':id/timing-problem') @HttpCode(200) @RequirePermission('appointment.edit', 'Own')
  timing(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TimingProblemDto, @Req() req: Req) {
    return this.appointments.reportTimingProblem(req.principal, id, dto);
  }

  @Post(':id/report-donation') @HttpCode(200) @RequirePermission('outcome.report', 'Own') @ApiOkResponse({ type: StaffAppointmentDto })
  donated(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.appointments.reportDonation(req.principal, id);
  }
}
