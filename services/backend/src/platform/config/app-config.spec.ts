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
});
