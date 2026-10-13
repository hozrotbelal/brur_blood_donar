import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AuditModule } from './modules/audit/audit.module';
import { CaseModule } from './modules/case-workflow/case-workflow.module';
import { CommunityModule } from './modules/community/community.module';
import { ConfigurationModule } from './modules/configuration/configuration.module';
import { AuthGuard } from './modules/identity/auth.guard';
import { IdentityModule } from './modules/identity/identity.module';
import { MatchingModule } from './modules/matching/matching.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NotificationModule } from './modules/notification/notification.module';
import { ReportingModule } from './modules/reporting/reporting.module';
import { RequestModule } from './modules/request/request.module';
import { SupportModule } from './modules/support/support.module';
import { AuditPlatformModule } from './platform/audit/audit.module';
import { DatabaseModule } from './platform/db/database.module';
import { ErrorModelFilter } from './platform/http/http-exception.filter';
import { HealthController } from './platform/http/health.controller';
import { IdempotencyInterceptor } from './platform/idempotency/idempotency.interceptor';
import { IdempotencyModule } from './platform/idempotency/idempotency.module';
import { OutboxModule } from './platform/outbox/outbox.module';
import { PolicyGuard } from './platform/policy/policy.guard';
import { PolicyModule } from './platform/policy/policy.module';

@Module({
  imports: [
    DatabaseModule,
    PolicyModule,
    IdempotencyModule,
    OutboxModule,
    AuditPlatformModule,
    IdentityModule,
    RequestModule,
    MatchingModule,
    CaseModule,
    SupportModule,
    NotificationModule,
    ModerationModule,
    AppointmentsModule,
    CommunityModule,
    ReportingModule,
    AuditModule,
    ConfigurationModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ErrorModelFilter },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_GUARD, useExisting: PolicyGuard },
    { provide: APP_INTERCEPTOR, useExisting: IdempotencyInterceptor },
  ],
})
export class AppModule {}
