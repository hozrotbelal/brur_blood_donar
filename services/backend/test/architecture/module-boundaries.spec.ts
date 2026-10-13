import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MODULES = join(__dirname, '..', '..', 'src', 'modules');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('module boundaries', () => {
  const moduleNames = readdirSync(MODULES);

  it('has the twelve module folders', () => {
    expect(moduleNames.sort()).toEqual(
      [
        'appointments', 'audit', 'case-workflow', 'community', 'configuration', 'identity',
        'matching', 'moderation', 'notification', 'reporting', 'request', 'support',
      ].sort(),
    );
  });

  it.each(moduleNames)('%s imports other modules only through their public file', (name) => {
    const violations: string[] = [];
    for (const file of files(join(MODULES, name))) {
      const imports = [...readFileSync(file, 'utf8').matchAll(/from '(\.[^']+)'/g)].map((m) => m[1]);
      for (const spec of imports) {
        const resolved = join(file, '..', spec);
        const target = resolved.slice(MODULES.length + 1).split(/[\\/]/);
        if (target[0] && moduleNames.includes(target[0]) && target[0] !== name) {
          if (!/^[a-z-]+\.public$/.test(target[1] ?? '')) violations.push(`${file}: ${spec}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps modules from importing the app root or entrypoints', () => {
    for (const file of files(MODULES)) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/from '(\.\.\/)+(app\.module|entrypoints)/);
    }
  });
});
