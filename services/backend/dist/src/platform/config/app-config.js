"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.APP_CONFIG = void 0;
exports.loadConfig = loadConfig;
exports.APP_CONFIG = Symbol('APP_CONFIG');
function loadConfig(env = process.env) {
    const nodeEnv = (env.NODE_ENV ?? 'development');
    if (!['development', 'test', 'staging', 'production'].includes(nodeEnv)) {
        throw new Error(`NODE_ENV must be development, test, staging or production`);
    }
    const port = Number(env.PORT ?? 3000);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('PORT must be an integer between 1 and 65535');
    }
    const required = (name) => {
        const value = env[name];
        if (!value)
            throw new Error(`${name} is required`);
        return value;
    };
    const trustedDays = Number(env.WEB_TRUSTED_BROWSER_DAYS ?? 30);
    if (!Number.isInteger(trustedDays) || trustedDays < 0 || trustedDays > 365) {
        throw new Error('WEB_TRUSTED_BROWSER_DAYS must be an integer from 0 to 365 (0 = fresh SMS code every sign-in)');
    }
    return {
        nodeEnv,
        port,
        databaseUrl: required('DATABASE_URL'),
        redisUrl: env.REDIS_URL ?? '',
        jwtPrivateKeyPath: env.JWT_PRIVATE_KEY_PATH ?? '',
        idempotencyTtlHours: Number(env.IDEMPOTENCY_TTL_HOURS ?? 24),
        webOrigin: (env.WEB_ORIGIN ?? '').replace(/\/+$/, ''),
        webTrustedBrowserDays: trustedDays,
        cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : nodeEnv === 'production' || nodeEnv === 'staging',
    };
}
//# sourceMappingURL=app-config.js.map