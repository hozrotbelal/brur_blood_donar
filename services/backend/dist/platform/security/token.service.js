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
exports.TokenService = exports.keyId = exports.TOKEN_KEYS = exports.CLOCK_SKEW_SECONDS = exports.TOKEN_AUDIENCE = void 0;
exports.loadTokenKeys = loadTokenKeys;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const app_config_1 = require("../config/app-config");
exports.TOKEN_AUDIENCE = '/api/v1';
exports.CLOCK_SKEW_SECONDS = 60;
exports.TOKEN_KEYS = Symbol('TOKEN_KEYS');
const b64 = (value) => Buffer.from(value).toString('base64url');
const keyId = (publicKey) => (0, node_crypto_1.createHash)('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
exports.keyId = keyId;
const assertP256 = (key) => {
    const curve = key.asymmetricKeyDetails?.namedCurve;
    if (key.asymmetricKeyType !== 'ec' || curve !== 'prime256v1')
        throw new Error('JWT keys must be EC P-256');
};
function loadTokenKeys(config) {
    const verifyKeys = [];
    let signingKey;
    if (config.jwtPrivateKeyPath) {
        signingKey = (0, node_crypto_1.createPrivateKey)((0, node_fs_1.readFileSync)(config.jwtPrivateKeyPath));
        assertP256(signingKey);
        verifyKeys.push((0, node_crypto_1.createPublicKey)(signingKey));
    }
    for (const path of config.jwtVerifyKeyPaths ?? []) {
        const key = (0, node_crypto_1.createPublicKey)((0, node_fs_1.readFileSync)(path));
        assertP256(key);
        verifyKeys.push(key);
    }
    if (!signingKey && verifyKeys.length === 0) {
        if (config.nodeEnv === 'production' || config.nodeEnv === 'staging') {
            throw new Error('JWT_PRIVATE_KEY_PATH (or JWT_VERIFY_KEY_PATHS for verify-only runtimes) is required outside development');
        }
        signingKey = (0, node_crypto_1.generateKeyPairSync)('ec', { namedCurve: 'P-256' }).privateKey;
        verifyKeys.push((0, node_crypto_1.createPublicKey)(signingKey));
    }
    return { signingKey, verifyKeys };
}
let TokenService = class TokenService {
    issuer;
    signingKey;
    signingKid;
    verifyKeys = new Map();
    constructor(config, keys) {
        keys ??= loadTokenKeys(config);
        this.issuer = config.jwtIssuer || 'bbda';
        this.signingKey = keys.signingKey;
        for (const key of keys.verifyKeys)
            this.verifyKeys.set((0, exports.keyId)(key), key);
        if (keys.signingKey)
            this.signingKid = (0, exports.keyId)((0, node_crypto_1.createPublicKey)(keys.signingKey));
    }
    get canIssue() {
        return this.signingKey !== undefined;
    }
    issue(use, claims, ttlSeconds, now = Date.now()) {
        if (!this.signingKey || !this.signingKid)
            throw new Error('this runtime holds no JWT signing key');
        const iat = Math.floor(now / 1000);
        const header = b64(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: this.signingKid }));
        const body = b64(JSON.stringify({ ...claims, use, iss: this.issuer, aud: exports.TOKEN_AUDIENCE, iat, nbf: iat, exp: iat + ttlSeconds }));
        const signature = (0, node_crypto_1.sign)('sha256', Buffer.from(`${header}.${body}`), { key: this.signingKey, dsaEncoding: 'ieee-p1363' });
        return `${header}.${body}.${b64(signature)}`;
    }
    verify(token, use, now = Date.now()) {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        try {
            const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
            if (header.alg !== 'ES256' || (header.typ !== undefined && header.typ !== 'JWT') || typeof header.kid !== 'string')
                return null;
            const key = this.verifyKeys.get(header.kid);
            if (!key)
                return null;
            const ok = (0, node_crypto_1.verify)('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
            if (!ok)
                return null;
            const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            const seconds = now / 1000;
            if (claims.use !== use || claims.iss !== this.issuer || claims.aud !== exports.TOKEN_AUDIENCE)
                return null;
            if (typeof claims.exp !== 'number' || claims.exp <= seconds)
                return null;
            if (typeof claims.iat !== 'number' || claims.iat > seconds + exports.CLOCK_SKEW_SECONDS)
                return null;
            if (claims.nbf !== undefined && (typeof claims.nbf !== 'number' || claims.nbf > seconds + exports.CLOCK_SKEW_SECONDS))
                return null;
            return claims;
        }
        catch {
            return null;
        }
    }
    jwks() {
        const keys = [];
        for (const [kid, key] of this.verifyKeys) {
            const jwk = key.export({ format: 'jwk' });
            keys.push({ kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, kid, use: 'sig', alg: 'ES256' });
        }
        return { keys };
    }
};
exports.TokenService = TokenService;
exports.TokenService = TokenService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(app_config_1.APP_CONFIG)),
    __param(1, (0, common_1.Optional)()),
    __param(1, (0, common_1.Inject)(exports.TOKEN_KEYS)),
    __metadata("design:paramtypes", [Object, Object])
], TokenService);
//# sourceMappingURL=token.service.js.map