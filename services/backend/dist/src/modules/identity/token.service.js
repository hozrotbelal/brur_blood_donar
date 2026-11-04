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
exports.TokenService = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const app_config_1 = require("../../platform/config/app-config");
const b64 = (value) => Buffer.from(value).toString('base64url');
let TokenService = class TokenService {
    privateKey;
    publicKey;
    constructor(config) {
        if (config.jwtPrivateKeyPath) {
            this.privateKey = (0, node_crypto_1.createPrivateKey)((0, node_fs_1.readFileSync)(config.jwtPrivateKeyPath));
            this.publicKey = (0, node_crypto_1.createPublicKey)(this.privateKey);
        }
        else if (config.nodeEnv === 'production' || config.nodeEnv === 'staging') {
            throw new Error('JWT_PRIVATE_KEY_PATH is required outside development');
        }
        else {
            const pair = (0, node_crypto_1.generateKeyPairSync)('ec', { namedCurve: 'P-256' });
            this.privateKey = pair.privateKey;
            this.publicKey = pair.publicKey;
        }
    }
    issue(use, claims, ttlSeconds, now = Date.now()) {
        const iat = Math.floor(now / 1000);
        const header = b64(JSON.stringify({ alg: 'ES256', typ: 'JWT' }));
        const body = b64(JSON.stringify({ ...claims, use, iat, exp: iat + ttlSeconds }));
        const signature = (0, node_crypto_1.sign)('sha256', Buffer.from(`${header}.${body}`), { key: this.privateKey, dsaEncoding: 'ieee-p1363' });
        return `${header}.${body}.${b64(signature)}`;
    }
    verify(token, use, now = Date.now()) {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        try {
            const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
            if (header.alg !== 'ES256')
                return null;
            const ok = (0, node_crypto_1.verify)('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key: this.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
            if (!ok)
                return null;
            const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            if (claims.use !== use || typeof claims.exp !== 'number' || claims.exp * 1000 <= now)
                return null;
            return claims;
        }
        catch {
            return null;
        }
    }
};
exports.TokenService = TokenService;
exports.TokenService = TokenService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(app_config_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object])
], TokenService);
//# sourceMappingURL=token.service.js.map