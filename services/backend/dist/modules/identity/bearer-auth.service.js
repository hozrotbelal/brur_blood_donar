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
exports.BearerAuthService = void 0;
const common_1 = require("@nestjs/common");
const bearer_authenticator_1 = require("../../platform/security/bearer-authenticator");
const token_service_1 = require("../../platform/security/token.service");
const auth_service_1 = require("./auth.service");
let BearerAuthService = class BearerAuthService extends bearer_authenticator_1.BearerAuthenticator {
    tokens;
    auth;
    constructor(tokens, auth) {
        super();
        this.tokens = tokens;
        this.auth = auth;
    }
    async authenticate(token) {
        const claims = this.tokens.verify(token, 'access');
        if (!claims?.sub || !claims.sid || !claims.role)
            return null;
        const session = await this.auth.resolveSession(claims.sid, claims.sub, claims.role);
        if (!session)
            return null;
        return {
            userId: claims.sub,
            role: claims.role,
            sessionId: claims.sid,
            stepUpAt: session.stepUpAt,
            grants: await this.auth.loadGrants(claims.sub, claims.role),
        };
    }
};
exports.BearerAuthService = BearerAuthService;
exports.BearerAuthService = BearerAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)(auth_service_1.AuthService)),
    __metadata("design:paramtypes", [token_service_1.TokenService,
        auth_service_1.AuthService])
], BearerAuthService);
//# sourceMappingURL=bearer-auth.service.js.map