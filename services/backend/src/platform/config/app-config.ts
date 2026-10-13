export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'staging' | 'production';
  port: number;
  databaseUrl: string;
  redisUrl: string;
  jwtPrivateKeyPath: string;
  idempotencyTtlHours: number;
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
  return {
    nodeEnv,
    port,
    databaseUrl: required('DATABASE_URL'),
    redisUrl: env.REDIS_URL ?? '',
    jwtPrivateKeyPath: env.JWT_PRIVATE_KEY_PATH ?? '',
    idempotencyTtlHours: Number(env.IDEMPOTENCY_TTL_HOURS ?? 24),
  };
}
