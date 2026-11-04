"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityModule = void 0;
const common_1 = require("@nestjs/common");
const donor_controller_1 = require("./donor.controller");
const donor_service_1 = require("./donor.service");
const donation_record_projector_1 = require("./donation-record.projector");
const status_history_service_1 = require("../../platform/status/status-history.service");
const auth_controller_1 = require("./auth.controller");
const auth_guard_1 = require("./auth.guard");
const auth_service_1 = require("./auth.service");
const password_service_1 = require("./password.service");
const sms_port_1 = require("./sms.port");
const staff_controller_1 = require("./staff.controller");
const staff_service_1 = require("./staff.service");
const web_auth_controller_1 = require("./web-auth.controller");
const web_auth_service_1 = require("./web-auth.service");
const token_service_1 = require("./token.service");
let IdentityModule = class IdentityModule {
};
exports.IdentityModule = IdentityModule;
exports.IdentityModule = IdentityModule = __decorate([
    (0, common_1.Module)({
        controllers: [auth_controller_1.AuthController, web_auth_controller_1.WebAuthController, donor_controller_1.DonorController, staff_controller_1.StaffController],
        providers: [
            password_service_1.PasswordService,
            token_service_1.TokenService,
            auth_service_1.AuthService,
            auth_guard_1.AuthGuard,
            donor_service_1.DonorService,
            staff_service_1.StaffService,
            web_auth_service_1.WebAuthService,
            donation_record_projector_1.DonationRecordProjector,
            status_history_service_1.StatusHistoryService,
            { provide: sms_port_1.SmsSender, useClass: sms_port_1.LogSmsSender },
        ],
        exports: [password_service_1.PasswordService, auth_guard_1.AuthGuard],
    })
], IdentityModule);
//# sourceMappingURL=identity.module.js.map