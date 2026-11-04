"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashOtp = exports.generateOtp = exports.OTP_REQUESTS_PER_15_MIN = exports.OTP_MAX_ATTEMPTS = exports.OTP_TTL_SECONDS = void 0;
exports.otpMatches = otpMatches;
const node_crypto_1 = require("node:crypto");
exports.OTP_TTL_SECONDS = 300;
exports.OTP_MAX_ATTEMPTS = 5;
exports.OTP_REQUESTS_PER_15_MIN = 3;
const generateOtp = () => String((0, node_crypto_1.randomInt)(0, 1_000_000)).padStart(6, '0');
exports.generateOtp = generateOtp;
const hashOtp = (challengeId, code) => (0, node_crypto_1.createHash)('sha256').update(`${challengeId}:${code}`).digest('hex');
exports.hashOtp = hashOtp;
function otpMatches(challengeId, code, storedHash) {
    const a = Buffer.from((0, exports.hashOtp)(challengeId, code), 'hex');
    const b = Buffer.from(storedHash, 'hex');
    return a.length === b.length && (0, node_crypto_1.timingSafeEqual)(a, b);
}
//# sourceMappingURL=otp.js.map