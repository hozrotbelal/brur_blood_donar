import { GENESIS_HASH, canonicalJson, chainHash, verifyChain } from './hash-chain';

describe('hash chain', () => {
  it('canonicalises key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(
      canonicalJson({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }),
    );
  });

  const build = () => {
    const records = [{ n: 1 }, { n: 2 }, { n: 3 }];
    let prev: Buffer = GENESIS_HASH;
    return records.map((record) => {
      const hash = chainHash(prev, record);
      const row = { prevHash: prev, hash, record };
      prev = hash;
      return row;
    });
  };

  it('verifies an intact chain', () => {
    expect(verifyChain(build())).toBe(-1);
  });

  it('reports the first tampered row', () => {
    const rows = build();
    rows[1].record = { n: 99 };
    expect(verifyChain(rows)).toBe(1);
  });

  it('detects a removed row', () => {
    const rows = build();
    rows.splice(1, 1);
    expect(verifyChain(rows)).toBe(1);
  });
});
