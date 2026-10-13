import { PasswordService } from './password.service';

describe('PasswordService', () => {
  const service = new PasswordService();

  it('hashes with argon2id and verifies', async () => {
    const hash = await service.hash('correct horse battery');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(hash, 'correct horse battery')).toBe(true);
    expect(await service.verify(hash, 'wrong')).toBe(false);
  });
});
