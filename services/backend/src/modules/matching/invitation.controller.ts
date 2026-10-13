import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { RespondDto, WithdrawInvitationDto } from './invitation.dto';
import { InvitationService } from './invitation.service';

interface Req {
  principal: Principal;
}

@ApiTags('invitations')
@ApiBearerAuth()
@Controller('invitations')
export class InvitationController {
  constructor(private readonly invitations: InvitationService) {}

  @Get() @RequirePermission('invitation.view', 'Own')
  list(@Req() req: Req) {
    return this.invitations.list(req.principal);
  }

  @Get(':id') @RequirePermission('invitation.view', 'Own')
  open(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.invitations.open(req.principal, id);
  }

  @Post(':id/respond') @HttpCode(200) @RequirePermission('invitation.respond', 'Own')
  respond(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RespondDto, @Req() req: Req) {
    return this.invitations.respond(req.principal, id, dto);
  }

  @Post(':id/withdraw') @HttpCode(200) @RequirePermission('invitation.respond', 'Own')
  withdraw(@Param('id', ParseUUIDPipe) id: string, @Body() dto: WithdrawInvitationDto, @Req() req: Req) {
    return this.invitations.withdraw(req.principal, id, dto);
  }
}
