"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeBdPhone = normalizeBdPhone;
exports.maskPhone = maskPhone;
function normalizeBdPhone(input) {
    const digits = input.replace(/[\s\-()]/g, '');
    const match = /^(?:\+?880|0)?(1[3-9]\d{8})$/.exec(digits);
    return match ? `+880${match[1]}` : null;
}
function maskPhone(e164) {
    return `${e164.slice(0, 7)}XXXX${e164.slice(-2)}`;
}
//# sourceMappingURL=phone.js.map