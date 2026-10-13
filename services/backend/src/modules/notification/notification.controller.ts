import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { RequirePermission } from '../../platform/policy/policy.guard';
import { Principal, SCOPE_ORDER } from '../../platform/policy/policy.types';
import { NotificationService } from './notification.service';

interface Req {
  principal: Principal;
}

class PushTokenDto {
  @IsString() @IsNotEmpty() @MaxLength(200) installId!: string;
  @IsString() @IsNotEmpty() @MaxLength(4096) token!: string;
}

@ApiTags('notifications')
@ApiBearerAuth()
@Controller()
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get('notifications') @RequirePermission('account.view', 'Own')
  inbox(@Req() req: Req, @Query('unread') unread?: string, @Query('limit') limit?: string) {
    return this.notifications.inbox(req.principal, { unreadOnly: unread === 'true', limit: limit ? Number(limit) : undefined });
  }

  @Get('notifications/unread-count') @RequirePermission('account.view', 'Own')
  unread(@Req() req: Req) {
    return this.notifications.unreadCount(req.principal);
  }

  @Post('notifications/read-all') @HttpCode(200) @RequirePermission('account.view', 'Own')
  readAll(@Req() req: Req) {
    return this.notifications.markAllRead(req.principal);
  }

  @Post('notifications/:id/read') @HttpCode(200) @RequirePermission('account.view', 'Own')
  read(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.notifications.markRead(req.principal, id);
  }

  @Post('notifications/:id/receipt') @HttpCode(200) @RequirePermission('account.view', 'Own')
  receipt(@Param('id', ParseUUIDPipe) id: string, @Req() req: Req) {
    return this.notifications.receipt(req.principal, id);
  }

  @Put('devices/push-token') @RequirePermission('account.edit', 'Own')
  pushToken(@Body() dto: PushTokenDto, @Req() req: Req) {
    return this.notifications.registerPushToken(req.principal, dto.installId, dto.token);
  }

  @Get('admin/delivery-reports') @RequirePermission('delivery_report.view', 'Area')
  report(@Req() req: Req, @Query('days') days?: string) {
    const scope = req.principal.grants.some((g) => g.key === 'delivery_report.view' && SCOPE_ORDER.indexOf(g.scope) >= SCOPE_ORDER.indexOf('All')) ? 'All' : 'Area';
    return this.notifications.deliveryReport(req.principal, scope, days ? Number(days) : 7);
  }
}
