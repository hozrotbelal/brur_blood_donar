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
exports.AuthGuard = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const public_decorator_1 = require("../../platform/policy/public.decorator");
const auth_service_1 = require("./auth.service");
const token_service_1 = require("./token.service");
let AuthGuard = class AuthGuard {
    reflector;
    tokens;
    auth;
    constructor(reflector, tokens, auth) {
        this.reflector = reflector;
        this.tokens = tokens;
        this.auth = auth;
    }
    async canActivate(context) {
        if (context.getType() !== 'http')
            return true;
        const isPublic = this.reflector.getAllAndOverride(public_decorator_1.IS_PUBLIC, [context.getHandler(), context.getClass()]);
        const request = context.switchToHttp().getRequest();
        const header = request.headers.authorization;
        const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
        if (!token) {
            if (isPublic)
                return true;
            throw new common_1.UnauthorizedException({ code: 'UNAUTHENTICATED' });
        }
        const claims = this.tokens.verify(token, 'access');
        if (!claims?.sub || !claims.sid || !claims.role || !(await this.auth.sessionIsActive(claims.sid, claims.sub))) {
            if (isPublic)
                return true;
            throw new common_1.UnauthorizedException({ code: 'UNAUTHENTICATED' });
        }
        request.principal = { userId: claims.sub, role: claims.role, sessionId: claims.sid, grants: await this.auth.loadGrants(claims.sub, claims.role) };
        return true;
    }
};
exports.AuthGuard = AuthGuard;
exports.AuthGuard = AuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(auth_service_1.AuthService)),
    __metadata("design:paramtypes", [core_1.Reflector,
        token_service_1.TokenService,
        auth_service_1.AuthService])
], AuthGuard);
//# sourceMappingURL=auth.guard.js.map