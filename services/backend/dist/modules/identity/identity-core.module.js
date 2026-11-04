"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdentityCoreModule = void 0;
const common_1 = require("@nestjs/common");
const bearer_authenticator_1 = require("../../platform/security/bearer-authenticator");
const token_service_1 = require("../../platform/security/token.service");
const auth_service_1 = require("./auth.service");
const auth_support_1 = require("./auth.support");
const bearer_auth_service_1 = require("./bearer-auth.service");
const password_flow_service_1 = require("./password-flow.service");
const password_service_1 = require("./password.service");
const session_service_1 = require("./session.service");
const sms_port_1 = require("./sms.port");
let IdentityCoreModule = class IdentityCoreModule {
};
exports.IdentityCoreModule = IdentityCoreModule;
exports.IdentityCoreModule = IdentityCoreModule = __decorate([
    (0, common_1.Module)({
        providers: [
            token_service_1.TokenService,
            password_service_1.PasswordService,
            auth_support_1.AuthSupport,
            auth_service_1.AuthService,
            password_flow_service_1.PasswordFlowService,
            session_service_1.SessionService,
            bearer_auth_service_1.BearerAuthService,
            { provide: bearer_authenticator_1.BearerAuthenticator, useExisting: bearer_auth_service_1.BearerAuthService },
            { provide: sms_port_1.SmsSender, useClass: sms_port_1.LogSmsSender },
        ],
        exports: [token_service_1.TokenService, password_service_1.PasswordService, auth_support_1.AuthSupport, auth_service_1.AuthService, password_flow_service_1.PasswordFlowService, session_service_1.SessionService, bearer_authenticator_1.BearerAuthenticator, sms_port_1.SmsSender],
    })
], IdentityCoreModule);
//# sourceMappingURL=identity-core.module.js.map