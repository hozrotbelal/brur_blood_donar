"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stepUpIsFresh = exports.STEP_UP_WINDOW_MS = exports.SCOPE_ORDER = void 0;
exports.SCOPE_ORDER = ['Own', 'Assigned', 'Area', 'All'];
exports.STEP_UP_WINDOW_MS = 5 * 60_000;
const stepUpIsFresh = (principal, now = new Date()) => !!principal.stepUpAt && now.getTime() - principal.stepUpAt.getTime() <= exports.STEP_UP_WINDOW_MS;
exports.stepUpIsFresh = stepUpIsFresh;
//# sourceMappingURL=policy.types.js.map