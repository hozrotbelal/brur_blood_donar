"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_config_1 = require("./app-config");
describe('loadConfig', () => {
    it('requires DATABASE_URL', () => {
        expect(() => (0, app_config_1.loadConfig)({ NODE_ENV: 'test' })).toThrow('DATABASE_URL is required');
    });
    it('rejects an invalid port', () => {
        expect(() => (0, app_config_1.loadConfig)({ DATABASE_URL: 'x', PORT: '99999' })).toThrow('PORT');
    });
    it('applies defaults', () => {
        const cfg = (0, app_config_1.loadConfig)({ DATABASE_URL: 'postgres://example' });
        expect(cfg.port).toBe(3000);
        expect(cfg.idempotencyTtlHours).toBe(24);
    });
});
//# sourceMappingURL=app-config.spec.js.map