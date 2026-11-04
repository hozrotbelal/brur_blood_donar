import { loadConfig } from './app-config';

describe('loadConfig', () => {
  it('requires DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'test' })).toThrow('DATABASE_URL is required');
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ DATABASE_URL: 'x', PORT: '99999' })).toThrow('PORT');
  });

  it('applies defaults', () => {
    const cfg = loadConfig({ DATABASE_URL: 'postgres://example' });
    expect(cfg.port).toBe(3000);
    expect(cfg.idempotencyTtlHours).toBe(24);
  });

  it('allows the staff SMS skip only in development or test', () => {
    const base = { DATABASE_URL: 'postgres://x', DEV_SKIP_STAFF_SMS_CODE: 'true' };
    expect(loadConfig({ ...base, NODE_ENV: 'development' }).devSkipStaffSmsCode).toBe(true);
    expect(loadConfig({ ...base, NODE_ENV: 'test' }).devSkipStaffSmsCode).toBe(true);
    expect(() => loadConfig({ ...base, NODE_ENV: 'staging' })).toThrow();
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow();
    expect(loadConfig({ DATABASE_URL: 'postgres://x', NODE_ENV: 'development' }).devSkipStaffSmsCode).toBe(false);
  });
});
