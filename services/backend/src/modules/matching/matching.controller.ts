import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { ApproveWaveDto } from './invitation.dto';
import { MatchingService } from './matching.service';

interface Req {
  principal: Principal;
}

@ApiTags('matching')
@ApiBearerAuth()
@Controller('staff')
export class MatchingController {
  constructor(private readonly matching: MatchingService) {}

  @Get('requests/:id/waves') @RequirePermission('blood_request.view', 'Assigned')
  waves(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.matching.listWaves(req.principal, id);
  }

  @Post('requests/:id/waves') @HttpCode(201) @RequirePermission('invitation.create', 'Assigned')
  expand(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.matching.expandSearch(req.principal, id);
  }

  @Post('waves/:id/approve') @HttpCode(200) @RequirePermission('invitation.create', 'Assigned')
  approve(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ApproveWaveDto, @Req() req: Req) {
    return this.matching.approveWave(req.principal, id, dto);
  }
}
