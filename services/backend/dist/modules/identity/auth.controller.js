"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_types_1 = require("../../platform/policy/policy.types");
const public_decorator_1 = require("../../platform/policy/public.decorator");
const token_service_1 = require("../../platform/security/token.service");
const auth_service_1 = require("./auth.service");
const schema_1 = require("./schema");
const auth_support_1 = require("./auth.support");
const auth_dto_1 = require("./auth.dto");
const password_flow_service_1 = require("./password-flow.service");
const session_service_1 = require("./session.service");
let AuthController = class AuthController {
    auth;
    passwords;
    sessions;
    support;
    tokens;
    constructor(auth, passwords, sessions, support, tokens) {
        this.auth = auth;
        this.passwords = passwords;
        this.sessions = sessions;
        this.support = support;
        this.tokens = tokens;
    }
    register(dto, req) {
        return this.auth.register({ ...dto, ip: req.ip });
    }
    loginOtp(dto, req) {
        return this.auth.loginOtp({ phone: dto.phone, ip: req.ip });
    }
    verifyOtp(dto, req) {
        return this.auth.verifyOtp({ ...dto, ip: req.ip });
    }
    setPassword(dto, req) {
        return this.auth.setPassword({ ...dto, ip: req.ip });
    }
    login(dto, req) {
        return this.auth.login({ ...dto, ip: req.ip });
    }
    staffVerify(dto, req) {
        return this.auth.verifyStaffMfa({ ...dto, ip: req.ip });
    }
    refresh(dto) {
        return this.auth.refresh(dto.refreshToken, dto.proof);
    }
    forgotPassword(dto, req) {
        return this.passwords.forgot({ phone: dto.phone, ip: req.ip });
    }
    resetPassword(dto, req) {
        return this.passwords.reset({ ...dto, ip: req.ip });
    }
    jwks() {
        return this.tokens.jwks();
    }
    changePassword(dto, req) {
        return this.passwords.change(req.principal, dto);
    }
    stepUpChallenge(req) {
        return this.sessions.stepUpChallenge(req.principal, req.ip);
    }
    stepUp(dto, req) {
        return this.sessions.stepUp(req.principal, dto);
    }
    async logout(req) {
        const p = req.principal;
        await this.auth.logout(p.sessionId, p.userId, p.role);
    }
    async me(req) {
        const p = req.principal;
        return {
            userId: p.userId,
            role: p.role,
            roles: await this.support.activeRoles(this.support.database, p.userId),
            displayName: (await this.support.database.orm.select({ name: schema_1.appUser.displayName }).from(schema_1.appUser).where((0, drizzle_orm_1.eq)(schema_1.appUser.id, p.userId)))[0]?.name ?? null,
            stepUpValidUntil: (0, policy_types_1.stepUpIsFresh)(p) && p.stepUpAt ? new Date(p.stepUpAt.getTime() + policy_types_1.STEP_UP_WINDOW_MS) : null,
            permissions: p.grants.map((g) => ({ key: g.key, scope: g.scope, requiresStepUp: g.requiresStepUp ?? false })),
        };
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/register'),
    (0, common_1.HttpCode)(202),
    (0, swagger_1.ApiResponse)({ status: 202, type: auth_dto_1.OtpChallengeDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RegisterDto, typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "register", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/login-otp'),
    (0, common_1.HttpCode)(202),
    (0, swagger_1.ApiResponse)({ status: 202, type: auth_dto_1.AcceptedDto, description: 'Same response whether or not the number is registered' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.PhoneDto, typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "loginOtp", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/verify-otp'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ schema: { oneOf: [{ $ref: (0, swagger_1.getSchemaPath)(auth_dto_1.SetupTokenDto) }, { $ref: (0, swagger_1.getSchemaPath)(auth_dto_1.ResetTokenDto) }, { $ref: (0, swagger_1.getSchemaPath)(auth_dto_1.TokenPairDto) }] } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.VerifyOtpDto, typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyOtp", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/set-password'),
    (0, common_1.HttpCode)(201),
    (0, swagger_1.ApiResponse)({ status: 201, type: auth_dto_1.TokenPairDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.SetPasswordDto, typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "setPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/login'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ schema: { oneOf: [{ $ref: (0, swagger_1.getSchemaPath)(auth_dto_1.TokenPairDto) }, { $ref: (0, swagger_1.getSchemaPath)(auth_dto_1.MfaChallengeDto) }] } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.LoginDto, typeof (_e = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/staff/verify-code'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ type: auth_dto_1.TokenPairDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.StaffMfaDto, typeof (_f = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _f : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "staffVerify", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/refresh'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ type: auth_dto_1.TokenPairDto }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.RefreshDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "refresh", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/password/forgot'),
    (0, common_1.HttpCode)(202),
    (0, swagger_1.ApiResponse)({ status: 202, type: auth_dto_1.AcceptedDto, description: 'Same response whether or not the number is registered' }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.PhoneDto, typeof (_g = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _g : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "forgotPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('auth/password/reset'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ type: auth_dto_1.ResetOutcomeDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.ResetPasswordDto, typeof (_h = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _h : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "resetPassword", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('auth/jwks'),
    (0, swagger_1.ApiOkResponse)({ description: 'Public keys for access-token verification (key rotation with overlapping validity)' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "jwks", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Post)('auth/password/change'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.ChangePasswordDto, typeof (_j = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _j : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "changePassword", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Post)('auth/step-up/challenge'),
    (0, common_1.HttpCode)(202),
    (0, swagger_1.ApiResponse)({ status: 202, type: auth_dto_1.OtpChallengeDto }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_k = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _k : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "stepUpChallenge", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Post)('auth/step-up'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ type: auth_dto_1.StepUpResultDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [auth_dto_1.StepUpDto, typeof (_l = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _l : Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "stepUp", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Post)('auth/logout'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_m = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _m : Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Get)('me'),
    (0, swagger_1.ApiOkResponse)({ type: auth_dto_1.MeDto }),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_o = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _o : Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "me", null);
exports.AuthController = AuthController = __decorate([
    (0, swagger_1.ApiTags)('auth'),
    (0, swagger_1.ApiExtraModels)(auth_dto_1.SetupTokenDto, auth_dto_1.ResetTokenDto, auth_dto_1.TokenPairDto, auth_dto_1.MfaChallengeDto),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [auth_service_1.AuthService,
        password_flow_service_1.PasswordFlowService,
        session_service_1.SessionService,
        auth_support_1.AuthSupport,
        token_service_1.TokenService])
], AuthController);
//# sourceMappingURL=auth.controller.js.map