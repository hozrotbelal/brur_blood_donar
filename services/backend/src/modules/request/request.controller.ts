import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { CancelRequestDto, CreatePatientDto, CreateRequestDto, SupplyInformationDto, UpdateRequestDto, UrgentProblemDto } from './request.dto';
import { RequestService } from './request.service';
import { PatientListItemDto, RequestChangeDto, RequestChangeResultDto, RequestProgressDto, RequestViewDto, TimelineEntryDto } from './request-view.dto';

interface Req {
  principal: Principal;
}

@ApiTags('requests')
@ApiBearerAuth()
@Controller()
export class RequestController {
  constructor(private readonly requests: RequestService) {}

  @Post('patients') @HttpCode(201) @RequirePermission('patient.create', 'Own')
  createPatient(@Body() dto: CreatePatientDto, @Req() req: Req) {
    return this.requests.createPatient(req.principal, dto);
  }

  @Get('patients') @RequirePermission('patient.view', 'Own') @ApiResponse({ status: 200, type: [PatientListItemDto] })
  listPatients(@Req() req: Req) {
    return this.requests.listPatients(req.principal);
  }

  @Post('requests') @HttpCode(201) @RequirePermission('blood_request.create', 'Own') @ApiResponse({ status: 201, type: RequestViewDto })
  create(@Body() dto: CreateRequestDto, @Req() req: Req) {
    return this.requests.createRequest(req.principal, dto);
  }

  @Get('requests') @RequirePermission('blood_request.view', 'Own') @ApiResponse({ status: 200, type: [RequestViewDto] })
  list(@Req() req: Req) {
    return this.requests.listRequests(req.principal);
  }

  @Get('requests/:id') @RequirePermission('blood_request.view', 'Own') @ApiResponse({ status: 200, type: RequestViewDto })
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.requests.getRequest(req.principal, id);
  }

  @Post('requests/:id/submit') @HttpCode(200) @RequirePermission('blood_request.edit', 'Own') @ApiResponse({ status: 200, type: RequestViewDto })
  submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.requests.submit(req.principal, id);
  }

  @Post('requests/:id/cancel') @HttpCode(200) @RequirePermission('blood_request.cancel', 'Own') @ApiResponse({ status: 200, type: RequestViewDto })
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelRequestDto, @Req() req: Req) {
    return this.requests.cancel(req.principal, id, dto);
  }

  @Post('requests/:id/changes') @HttpCode(200) @RequirePermission('blood_request.edit', 'Own') @ApiResponse({ status: 200, type: RequestChangeResultDto })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateRequestDto, @Req() req: Req) {
    return this.requests.updateRequest(req.principal, id, dto);
  }

  @Get('requests/:id/changes') @RequirePermission('blood_request.view', 'Own') @ApiResponse({ status: 200, type: [RequestChangeDto] })
  changes(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.requests.listChanges(req.principal, id);
  }

  @Get('requests/:id/progress') @RequirePermission('blood_request.view', 'Own') @ApiResponse({ status: 200, type: RequestProgressDto, description: 'Aggregate search counts only' })
  progress(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.requests.progress(req.principal, id);
  }

  @Post('requests/:id/urgent-problem') @HttpCode(200) @RequirePermission('blood_request.edit', 'Own') @ApiResponse({ status: 200, type: RequestViewDto })
  urgentProblem(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UrgentProblemDto, @Req() req: Req) {
    return this.requests.reportUrgentProblem(req.principal, id, dto);
  }

  @Post('requests/:id/supply-information') @HttpCode(200) @RequirePermission('blood_request.edit', 'Own')
  supply(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SupplyInformationDto, @Req() req: Req) {
    return this.requests.supplyInformation(req.principal, id, dto);
  }

  @Get('requests/:id/timeline') @RequirePermission('blood_request.view', 'Own') @ApiResponse({ status: 200, type: [TimelineEntryDto] })
  timeline(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.requests.timeline(req.principal, id);
  }
}
