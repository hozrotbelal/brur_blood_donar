import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { Public } from '../../platform/policy/public.decorator';
import { AcceptStaffInvitationDto, ChangeAssignmentDto, InviteStaffDto } from './staff.dto';
import { StaffService } from './staff.service';

interface Req {
  principal: Principal;
}

@ApiTags('staff-admin')
@ApiBearerAuth()
@Controller()
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Post('admin/staff-invitations') @HttpCode(201) @RequirePermission('staff.invite', 'All')
  invite(@Body() dto: InviteStaffDto, @Req() req: Req) {
    return this.staff.invite(req.principal, dto);
  }

  @Get('admin/staff-invitations') @RequirePermission('staff.invite', 'All')
  list(@Req() req: Req) {
    return this.staff.list(req.principal);
  }

  @Post('admin/staff-invitations/:id/revoke') @HttpCode(200) @RequirePermission('staff.invite', 'All')
  revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.staff.revoke(req.principal, id);
  }

  @Post('admin/staff/:userId/assignment') @HttpCode(200) @RequirePermission('permission.manage', 'All')
  assign(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: ChangeAssignmentDto, @Req() req: Req) {
    return this.staff.changeAssignment(req.principal, userId, dto);
  }

  @Public() @Post('auth/staff/accept-invitation') @HttpCode(201)
  accept(@Body() dto: AcceptStaffInvitationDto) {
    return this.staff.accept(dto);
  }
}
