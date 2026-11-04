import { Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { SessionService } from './session.service';

interface Req {
  ip?: string;
  principal: Principal;
}

@ApiTags('security')
@ApiBearerAuth()
@Controller()
export class SecurityController {
  constructor(private readonly sessions: SessionService) {}

  @Get('auth/sessions') @RequirePermission('account.view', 'Own')
  list(@Req() req: Req) {
    return this.sessions.list(req.principal);
  }

  @Post('auth/devices/:deviceId/sign-out') @HttpCode(200) @RequirePermission('device.signout', 'Own')
  signOutDevice(@Param('deviceId', ParseUUIDPipe) deviceId: string, @Req() req: Req) {
    return this.sessions.signOutDevice(req.principal, deviceId);
  }

  @Post('auth/sessions/sign-out-others') @HttpCode(200) @RequirePermission('device.signout', 'Own')
  signOutOthers(@Req() req: Req) {
    return this.sessions.signOutOthers(req.principal);
  }

  @Get('security/login-activity') @RequirePermission('audit.view.own', 'Own')
  loginActivity(@Req() req: Req, @Query('limit') limit?: string) {
    return this.sessions.loginActivity(req.principal, limit ? Number(limit) : undefined);
  }

  @Post('security/login-activity/:id/report') @HttpCode(200) @RequirePermission('audit.view.own', 'Own')
  report(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.sessions.reportSuspicious(req.principal, id);
  }
}
