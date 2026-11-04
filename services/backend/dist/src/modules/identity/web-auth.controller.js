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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebAuthController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../../platform/policy/public.decorator");
const web_auth_dto_1 = require("./web-auth.dto");
const web_auth_service_1 = require("./web-auth.service");
let WebAuthController = class WebAuthController {
    web;
    constructor(web) {
        this.web = web;
    }
    login(dto, h, req, reply) {
        return this.send(reply, this.web.login(dto, this.ctx(h, req.ip)));
    }
    verify(dto, h, req, reply) {
        return this.send(reply, this.web.verifyStaff(dto, this.ctx(h, req.ip)));
    }
    refresh(h, req, reply) {
        return this.send(reply, this.web.refresh(this.ctx(h, req.ip)));
    }
    async logout(h, req, reply) {
        await this.send(reply, this.web.logout(this.ctx(h, req.ip)));
    }
    ctx(h, ip) {
        return { origin: h.origin, cookieHeader: h.cookie, csrfHeader: h[web_auth_service_1.CSRF_HEADER], userAgent: h['user-agent'], ip };
    }
    async send(reply, work) {
        const result = await work;
        if (result.cookies.length)
            reply.header('set-cookie', result.cookies);
        return result.body;
    }
};
exports.WebAuthController = WebAuthController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('login'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ schema: { oneOf: [{ $ref: (0, swagger_1.getSchemaPath)(web_auth_dto_1.WebMfaChallengeDto) }, { $ref: (0, swagger_1.getSchemaPath)(web_auth_dto_1.WebSignedInDto) }] } }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [web_auth_dto_1.WebLoginDto, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WebAuthController.prototype, "login", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('staff/verify-code'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ type: web_auth_dto_1.WebSignedInDto }),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)()),
    __param(2, (0, common_1.Req)()),
    __param(3, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [web_auth_dto_1.WebStaffVerifyDto, Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WebAuthController.prototype, "verify", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('refresh'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOkResponse)({ type: web_auth_dto_1.WebSignedInDto }),
    __param(0, (0, common_1.Headers)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], WebAuthController.prototype, "refresh", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('logout'),
    (0, common_1.HttpCode)(204),
    __param(0, (0, common_1.Headers)()),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Res)({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], WebAuthController.prototype, "logout", null);
exports.WebAuthController = WebAuthController = __decorate([
    (0, swagger_1.ApiTags)('web-auth'),
    (0, swagger_1.ApiExtraModels)(web_auth_dto_1.WebMfaChallengeDto, web_auth_dto_1.WebSignedInDto),
    (0, common_1.Controller)('web/auth'),
    __metadata("design:paramtypes", [web_auth_service_1.WebAuthService])
], WebAuthController);
//# sourceMappingURL=web-auth.controller.js.map