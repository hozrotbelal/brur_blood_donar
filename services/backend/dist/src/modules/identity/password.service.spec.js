"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const password_service_1 = require("./password.service");
describe('PasswordService', () => {
    const service = new password_service_1.PasswordService();
    it('hashes with argon2id and verifies', async () => {
        const hash = await service.hash('correct horse battery');
        expect(hash.startsWith('$argon2id$')).toBe(true);
        expect(await service.verify(hash, 'correct horse battery')).toBe(true);
        expect(await service.verify(hash, 'wrong')).toBe(false);
    });
});
//# sourceMappingURL=password.service.spec.js.map