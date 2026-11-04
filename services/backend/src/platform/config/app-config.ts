export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtIssuer: string;
  jwtPrivateKeyPath: string;
  jwtVerifyKeyPaths: string[];
  idempotencyTtlHours: number;
  webOrigin: string;
  webTrustedBrowserDays: number;
  cookieSecure: boolean;
  devSkipStaffSmsCode: boolean;
}

export const APP_CONFIG = Symbol('APP_CONFIG');

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = (env.NODE_ENV ?? 'development') as AppConfig['nodeEnv'];
  if (!['development', 'test', 'staging', 'production'].includes(nodeEnv)) {
    throw new Error(`NODE_ENV must be development, test, staging or production`);
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const required = (name: string): string => {
    const value = env[name];
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const trustedDays = Number(env.WEB_TRUSTED_BROWSER_DAYS ?? 30);
  if (!Number.isInteger(trustedDays) || trustedDays < 0 || trustedDays > 365) {
    throw new Error('WEB_TRUSTED_BROWSER_DAYS must be an integer from 0 to 365 (0 = fresh SMS code every sign-in)');
  }
  const devSkip = env.DEV_SKIP_STAFF_SMS_CODE === 'true';
  if (devSkip && nodeEnv !== 'development' && nodeEnv !== 'test') {
    throw new Error('DEV_SKIP_STAFF_SMS_CODE is only allowed when NODE_ENV is development or test');
  }
  const issuer = (env.JWT_ISSUER ?? 'bbda').trim();
  if (!issuer) throw new Error('JWT_ISSUER must not be empty');
  return {
    nodeEnv,
    port,
    databaseUrl: required('DATABASE_URL'),
    redisUrl: env.REDIS_URL ?? '',
    jwtIssuer: issuer,
    jwtPrivateKeyPath: env.JWT_PRIVATE_KEY_PATH ?? '',
    jwtVerifyKeyPaths: (env.JWT_VERIFY_KEY_PATHS ?? '')
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean),
    idempotencyTtlHours: Number(env.IDEMPOTENCY_TTL_HOURS ?? 24),
    webOrigin: (env.WEB_ORIGIN ?? '').replace(/\/+$/, ''),
    webTrustedBrowserDays: trustedDays,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : nodeEnv === 'production' || nodeEnv === 'staging',
    devSkipStaffSmsCode: devSkip,
  };
}
