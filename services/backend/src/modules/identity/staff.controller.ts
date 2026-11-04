import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { RequireAnyPermission, RequirePermission } from '../../platform/policy/policy.guard';
import { Principal } from '../../platform/policy/policy.types';
import { Public } from '../../platform/policy/public.decorator';
import {
  AcceptStaffInvitationDto, AssignmentChangedDto, ChangeAssignmentDto, DeviceResetDto, InviteStaffDto, StaffDeactivatedDto, StaffInvitationDto, StaffInvitationCreatedDto, StaffMemberDto,
  StaffReasonDto, AccessReviewDto, AccessReviewQueryDto, GrantDecisionDto, GrantDecisionResultDto, PermissionSetViewDto,
} from './staff.dto';
import { AccessReviewService } from './access-review.service';
import { StaffService } from './staff.service';

interface Req {
  principal: Principal;
}

@ApiTags('staff-admin')
@ApiBearerAuth()
@Controller()
export class StaffController {
  constructor(
    private readonly staff: StaffService,
    private readonly reviews: AccessReviewService,
  ) {}

  @Post('admin/staff-invitations') @HttpCode(201) @RequirePermission('staff.invite', 'All') @ApiOkResponse({ type: StaffInvitationCreatedDto })
  invite(@Body() dto: InviteStaffDto, @Req() req: Req) {
    return this.staff.invite(req.principal, dto);
  }

  @Get('admin/staff-invitations') @RequirePermission('staff.invite', 'All') @ApiOkResponse({ type: [StaffInvitationDto] })
  list(@Req() req: Req) {
    return this.staff.list(req.principal);
  }

  @Post('admin/staff-invitations/:id/revoke') @HttpCode(200) @RequirePermission('staff.invite', 'All')
  revoke(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.staff.revoke(req.principal, id);
  }

  @Get('admin/staff') @RequireAnyPermission({ key: 'staff.invite', minScope: 'All' }, { key: 'permission.manage', minScope: 'All' }) @ApiOkResponse({ type: [StaffMemberDto] })
  staffList() {
    return this.staff.staffList();
  }

  @Post('admin/staff/:userId/assignment') @HttpCode(200) @RequirePermission('permission.manage', 'All') @ApiOkResponse({ type: AssignmentChangedDto })
  assign(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: ChangeAssignmentDto, @Req() req: Req) {
    return this.staff.changeAssignment(req.principal, userId, dto);
  }

  @Post('admin/staff/:userId/deactivate') @HttpCode(200) @RequirePermission('permission.manage', 'All') @ApiOkResponse({ type: StaffDeactivatedDto })
  deactivate(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: StaffReasonDto, @Req() req: Req) {
    return this.staff.deactivate(req.principal, userId, dto.reason);
  }

  @Post('admin/staff/:userId/reset-device') @HttpCode(200) @RequirePermission('permission.manage', 'All') @ApiOkResponse({ type: DeviceResetDto })
  resetDevice(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: StaffReasonDto, @Req() req: Req) {
    return this.staff.resetDevices(req.principal, userId, dto.reason);
  }

  @Get('admin/permission-sets') @RequireAnyPermission({ key: 'staff.invite', minScope: 'All' }, { key: 'permission.manage', minScope: 'All' }) @ApiOkResponse({ type: [PermissionSetViewDto] })
  permissionSets() {
    return this.reviews.permissionSets();
  }

  @Get('admin/access-review') @RequireAnyPermission({ key: 'staff.invite', minScope: 'All' }, { key: 'permission.manage', minScope: 'All' }) @ApiOkResponse({ type: AccessReviewDto })
  accessReview(@Query() query: AccessReviewQueryDto) {
    return this.reviews.review(query.month);
  }

  @Post('admin/access-review/grants/:grantId/decision') @HttpCode(200) @RequirePermission('permission.manage', 'All') @ApiOkResponse({ type: GrantDecisionResultDto })
  decide(@Param('grantId', ParseUUIDPipe) grantId: string, @Body() dto: GrantDecisionDto, @Req() req: Req) {
    return this.reviews.decide(req.principal, grantId, dto);
  }

  @Public() @Post('auth/staff/accept-invitation') @HttpCode(201)
  accept(@Body() dto: AcceptStaffInvitationDto) {
    return this.staff.accept(dto);
  }
}
