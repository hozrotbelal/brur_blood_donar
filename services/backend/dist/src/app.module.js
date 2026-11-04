"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const appointments_module_1 = require("./modules/appointments/appointments.module");
const audit_module_1 = require("./modules/audit/audit.module");
const case_workflow_module_1 = require("./modules/case-workflow/case-workflow.module");
const community_module_1 = require("./modules/community/community.module");
const configuration_module_1 = require("./modules/configuration/configuration.module");
const auth_guard_1 = require("./modules/identity/auth.guard");
const identity_module_1 = require("./modules/identity/identity.module");
const matching_module_1 = require("./modules/matching/matching.module");
const moderation_module_1 = require("./modules/moderation/moderation.module");
const notification_module_1 = require("./modules/notification/notification.module");
const reporting_module_1 = require("./modules/reporting/reporting.module");
const request_module_1 = require("./modules/request/request.module");
const support_module_1 = require("./modules/support/support.module");
const audit_module_2 = require("./platform/audit/audit.module");
const database_module_1 = require("./platform/db/database.module");
const http_exception_filter_1 = require("./platform/http/http-exception.filter");
const health_controller_1 = require("./platform/http/health.controller");
const idempotency_interceptor_1 = require("./platform/idempotency/idempotency.interceptor");
const idempotency_module_1 = require("./platform/idempotency/idempotency.module");
const outbox_module_1 = require("./platform/outbox/outbox.module");
const policy_guard_1 = require("./platform/policy/policy.guard");
const policy_module_1 = require("./platform/policy/policy.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            database_module_1.DatabaseModule,
            policy_module_1.PolicyModule,
            idempotency_module_1.IdempotencyModule,
            outbox_module_1.OutboxModule,
            audit_module_2.AuditPlatformModule,
            identity_module_1.IdentityModule,
            request_module_1.RequestModule,
            matching_module_1.MatchingModule,
            case_workflow_module_1.CaseModule,
            support_module_1.SupportModule,
            notification_module_1.NotificationModule,
            moderation_module_1.ModerationModule,
            appointments_module_1.AppointmentsModule,
            community_module_1.CommunityModule,
            reporting_module_1.ReportingModule,
            audit_module_1.AuditModule,
            configuration_module_1.ConfigurationModule,
        ],
        controllers: [health_controller_1.HealthController],
        providers: [
            { provide: core_1.APP_FILTER, useClass: http_exception_filter_1.ErrorModelFilter },
            { provide: core_1.APP_GUARD, useExisting: auth_guard_1.AuthGuard },
            { provide: core_1.APP_GUARD, useExisting: policy_guard_1.PolicyGuard },
            { provide: core_1.APP_INTERCEPTOR, useExisting: idempotency_interceptor_1.IdempotencyInterceptor },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map