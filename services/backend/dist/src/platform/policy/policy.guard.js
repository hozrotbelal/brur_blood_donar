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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyGuard = exports.RequirePermission = exports.REQUIRE_PERMISSION = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const policy_service_1 = require("./policy.service");
exports.REQUIRE_PERMISSION = 'bbda:require-permission';
const RequirePermission = (key, minScope) => (0, common_1.SetMetadata)(exports.REQUIRE_PERMISSION, { key, minScope });
exports.RequirePermission = RequirePermission;
let PolicyGuard = class PolicyGuard {
    reflector;
    policy;
    constructor(reflector, policy) {
        this.reflector = reflector;
        this.policy = policy;
    }
    canActivate(context) {
        const required = this.reflector.getAllAndOverride(exports.REQUIRE_PERMISSION, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required)
            return true;
        const request = context.switchToHttp().getRequest();
        if (!request.principal)
            throw new common_1.UnauthorizedException();
        const decision = this.policy.decide(request.principal, required.key, { minScope: required.minScope });
        if (!decision.allowed)
            throw new common_1.ForbiddenException({ code: 'FORBIDDEN', permission: required.key });
        return true;
    }
};
exports.PolicyGuard = PolicyGuard;
exports.PolicyGuard = PolicyGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [core_1.Reflector,
        policy_service_1.PolicyService])
], PolicyGuard);
//# sourceMappingURL=policy.guard.js.map