import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { CancelRequestDto, CreatePatientDto, CreateRequestDto, SupplyInformationDto } from './request.dto';
import { RequestService } from './request.service';

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

  @Get('patients') @RequirePermission('patient.view', 'Own')
  listPatients(@Req() req: Req) {
    return this.requests.listPatients(req.principal);
  }

  @Post('requests') @HttpCode(201) @RequirePermission('blood_request.create', 'Own')
  create(@Body() dto: CreateRequestDto, @Req() req: Req) {
    return this.requests.createRequest(req.principal, dto);
  }

  @Get('requests') @RequirePermission('blood_request.view', 'Own')
  list(@Req() req: Req) {
    return this.requests.listRequests(req.principal);
  }

  @Get('requests/:id') @RequirePermission('blood_request.view', 'Own')
  get(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.requests.getRequest(req.principal, id);
  }

  @Post('requests/:id/submit') @HttpCode(200) @RequirePermission('blood_request.edit', 'Own')
  submit(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.requests.submit(req.principal, id);
  }

  @Post('requests/:id/cancel') @HttpCode(200) @RequirePermission('blood_request.cancel', 'Own')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelRequestDto, @Req() req: Req) {
    return this.requests.cancel(req.principal, id, dto);
  }

  @Post('requests/:id/supply-information') @HttpCode(200) @RequirePermission('blood_request.edit', 'Own')
  supply(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SupplyInformationDto, @Req() req: Req) {
    return this.requests.supplyInformation(req.principal, id, dto);
  }

  @Get('requests/:id/timeline') @RequirePermission('blood_request.view', 'Own')
  timeline(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.requests.timeline(req.principal, id);
  }
}
