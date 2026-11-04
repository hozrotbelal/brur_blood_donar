"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proofMessage = exports.PROOF_MAX_SKEW_MS = void 0;
exports.normalizeDevicePublicKey = normalizeDevicePublicKey;
exports.verifyDeviceProof = verifyDeviceProof;
const node_crypto_1 = require("node:crypto");
exports.PROOF_MAX_SKEW_MS = 5 * 60_000;
const proofMessage = (kind, subject, timestamp) => `bbda:${kind}:${subject}:${timestamp}`;
exports.proofMessage = proofMessage;
function normalizeDevicePublicKey(pem) {
    try {
        const key = (0, node_crypto_1.createPublicKey)(pem);
        const curve = key.asymmetricKeyDetails?.namedCurve;
        if (key.asymmetricKeyType !== 'ec' || curve !== 'prime256v1')
            return null;
        return key.export({ type: 'spki', format: 'pem' });
    }
    catch {
        return null;
    }
}
function verifyDeviceProof(publicKeyPem, kind, subject, proof, now = Date.now()) {
    if (!Number.isFinite(proof.timestamp) || Math.abs(now - proof.timestamp) > exports.PROOF_MAX_SKEW_MS)
        return false;
    let key;
    try {
        key = (0, node_crypto_1.createPublicKey)(publicKeyPem);
    }
    catch {
        return false;
    }
    try {
        const message = Buffer.from((0, exports.proofMessage)(kind, subject, proof.timestamp));
        return (0, node_crypto_1.verify)('sha256', message, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(proof.signature, 'base64url'));
    }
    catch {
        return false;
    }
}
//# sourceMappingURL=device-proof.js.map