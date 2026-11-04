"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const hash_chain_1 = require("./hash-chain");
describe('hash chain', () => {
    it('canonicalises key order', () => {
        expect((0, hash_chain_1.canonicalJson)({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe((0, hash_chain_1.canonicalJson)({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }));
    });
    const build = () => {
        const records = [{ n: 1 }, { n: 2 }, { n: 3 }];
        let prev = hash_chain_1.GENESIS_HASH;
        return records.map((record) => {
            const hash = (0, hash_chain_1.chainHash)(prev, record);
            const row = { prevHash: prev, hash, record };
            prev = hash;
            return row;
        });
    };
    it('verifies an intact chain', () => {
        expect((0, hash_chain_1.verifyChain)(build())).toBe(-1);
    });
    it('reports the first tampered row', () => {
        const rows = build();
        rows[1].record = { n: 99 };
        expect((0, hash_chain_1.verifyChain)(rows)).toBe(1);
    });
    it('detects a removed row', () => {
        const rows = build();
        rows.splice(1, 1);
        expect((0, hash_chain_1.verifyChain)(rows)).toBe(1);
    });
});
//# sourceMappingURL=hash-chain.spec.js.map