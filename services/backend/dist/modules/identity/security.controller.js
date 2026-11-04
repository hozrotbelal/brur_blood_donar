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
var _a, _b, _c, _d, _e;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecurityController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const policy_guard_1 = require("../../platform/policy/policy.guard");
const session_service_1 = require("./session.service");
let SecurityController = class SecurityController {
    sessions;
    constructor(sessions) {
        this.sessions = sessions;
    }
    list(req) {
        return this.sessions.list(req.principal);
    }
    signOutDevice(deviceId, req) {
        return this.sessions.signOutDevice(req.principal, deviceId);
    }
    signOutOthers(req) {
        return this.sessions.signOutOthers(req.principal);
    }
    loginActivity(req, limit) {
        return this.sessions.loginActivity(req.principal, limit ? Number(limit) : undefined);
    }
    report(id, req) {
        return this.sessions.reportSuspicious(req.principal, id);
    }
};
exports.SecurityController = SecurityController;
__decorate([
    (0, common_1.Get)('auth/sessions'),
    (0, policy_guard_1.RequirePermission)('account.view', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_a = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _a : Object]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "list", null);
__decorate([
    (0, common_1.Post)('auth/devices/:deviceId/sign-out'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('device.signout', 'Own'),
    __param(0, (0, common_1.Param)('deviceId', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_b = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _b : Object]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "signOutDevice", null);
__decorate([
    (0, common_1.Post)('auth/sessions/sign-out-others'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('device.signout', 'Own'),
    __param(0, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_c = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _c : Object]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "signOutOthers", null);
__decorate([
    (0, common_1.Get)('security/login-activity'),
    (0, policy_guard_1.RequirePermission)('audit.view.own', 'Own'),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [typeof (_d = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _d : Object, String]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "loginActivity", null);
__decorate([
    (0, common_1.Post)('security/login-activity/:id/report'),
    (0, common_1.HttpCode)(200),
    (0, policy_guard_1.RequirePermission)('audit.view.own', 'Own'),
    __param(0, (0, common_1.Param)('id', common_1.ParseUUIDPipe)),
    __param(1, (0, common_1.Req)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, typeof (_e = typeof common_1.Req !== "undefined" && common_1.Req) === "function" ? _e : Object]),
    __metadata("design:returntype", void 0)
], SecurityController.prototype, "report", null);
exports.SecurityController = SecurityController = __decorate([
    (0, swagger_1.ApiTags)('security'),
    (0, swagger_1.ApiBearerAuth)(),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [session_service_1.SessionService])
], SecurityController);
//# sourceMappingURL=security.controller.js.map