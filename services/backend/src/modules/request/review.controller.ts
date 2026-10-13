import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { OutreachService } from './outreach.service';
import { PauseOutreachDto, RejectRequestDto, ResolveFlagDto, RequestInformationDto, VerifyRequestDto } from './review.dto';
import { ReviewService } from './review.service';

interface Req {
  principal: Principal;
}

@ApiTags('staff-review')
@ApiBearerAuth()
@Controller('staff/requests')
export class ReviewController {
  constructor(
    private readonly review: ReviewService,
    private readonly outreach: OutreachService,
  ) {}

  @Get() @RequirePermission('blood_request.view', 'Assigned')
  queue(@Req() req: Req, @Query('status') status?: string) {
    return this.review.queue(req.principal, status);
  }

  @Get(':id') @RequirePermission('blood_request.view', 'Assigned')
  detail(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.review.detail(req.principal, id);
  }

  @Post(':id/flags/:flagId/resolve') @HttpCode(200) @RequirePermission('blood_request.approve', 'Assigned')
  resolveFlag(@Param('id', ParseUUIDPipe) id: string, @Param('flagId', ParseUUIDPipe) flagId: string, @Body() dto: ResolveFlagDto, @Req() req: Req) {
    return this.review.resolveFlag(req.principal, id, flagId, dto);
  }

  @Post(':id/pause-outreach') @HttpCode(200) @RequirePermission('outreach.pause', 'Assigned')
  pauseOutreach(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PauseOutreachDto, @Req() req: Req) {
    return this.outreach.pause(req.principal, id, dto.reason);
  }

  @Post(':id/resume-outreach') @HttpCode(200) @RequirePermission('outreach.pause', 'Assigned')
  resumeOutreach(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.outreach.resume(req.principal, id);
  }

  @Post(':id/pick-up') @HttpCode(200) @RequirePermission('blood_request.approve', 'Assigned')
  pickUp(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.review.pickUp(req.principal, id);
  }

  @Post(':id/request-information') @HttpCode(200) @RequirePermission('blood_request.approve', 'Assigned')
  requestInformation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestInformationDto, @Req() req: Req) {
    return this.review.requestInformation(req.principal, id, dto);
  }

  @Post(':id/verify') @HttpCode(200) @RequirePermission('blood_request.approve', 'Assigned')
  verify(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VerifyRequestDto, @Req() req: Req) {
    return this.review.verify(req.principal, id, dto);
  }

  @Post(':id/reject') @HttpCode(200)
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectRequestDto, @Req() req: Req) {
    return this.review.reject(req.principal, id, dto);
  }
}
