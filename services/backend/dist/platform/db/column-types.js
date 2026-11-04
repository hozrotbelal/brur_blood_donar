"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.geography = exports.bytea = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.bytea = (0, pg_core_1.customType)({
    dataType: () => 'bytea',
});
exports.geography = (0, pg_core_1.customType)({
    dataType: () => 'geography',
    toDriver: (value) => value,
    fromDriver: (value) => value,
});
//# sourceMappingURL=column-types.js.map