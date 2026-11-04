import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'messages');
const load = (locale) => JSON.parse(readFileSync(join(root, `${locale}.json`), 'utf8'));

const en = load('en');
const bn = load('bn');
const missingInBn = Object.keys(en).filter((key) => !(key in bn));
const missingInEn = Object.keys(bn).filter((key) => !(key in en));
const empty = Object.entries(bn).filter(([, value]) => typeof value !== 'string' || value.trim() === '').map(([key]) => key);

if (missingInBn.length || missingInEn.length || empty.length) {
  if (missingInBn.length) console.error(`Missing in bn.json: ${missingInBn.join(', ')}`);
  if (missingInEn.length) console.error(`Missing in en.json: ${missingInEn.join(', ')}`);
  if (empty.length) console.error(`Empty Bangla strings: ${empty.join(', ')}`);
  process.exit(1);
}
console.log(`i18n OK: ${Object.keys(en).length} keys in English and Bangla`);
