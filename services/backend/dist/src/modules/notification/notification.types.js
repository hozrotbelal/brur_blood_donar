"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryOf = exports.CATEGORY_BY_EVENT = void 0;
exports.CATEGORY_BY_EVENT = {
    'NTF-EV-04': 'INVITATIONS',
    'NTF-EV-11': 'REMINDERS',
    'NTF-EV-14': 'REMINDERS',
    'NTF-EV-18': 'SYSTEM',
};
const categoryOf = (eventCode) => exports.CATEGORY_BY_EVENT[eventCode] ?? 'REQUEST_UPDATES';
exports.categoryOf = categoryOf;
//# sourceMappingURL=notification.types.js.map