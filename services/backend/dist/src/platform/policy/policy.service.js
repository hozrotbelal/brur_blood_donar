"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyService = void 0;
const common_1 = require("@nestjs/common");
const policy_types_1 = require("./policy.types");
const rank = (scope) => policy_types_1.SCOPE_ORDER.indexOf(scope);
let PolicyService = class PolicyService {
    decide(principal, key, options = {}) {
        const now = options.now ?? new Date();
        const live = principal.grants.filter((g) => g.key === key && (!g.expiresAt || g.expiresAt.getTime() > now.getTime()));
        if (live.length === 0)
            return { allowed: false, permissionKey: key, reason: 'NO_GRANT' };
        const widest = live.reduce((a, b) => (rank(a.scope) >= rank(b.scope) ? a : b)).scope;
        if (options.minScope && rank(widest) < rank(options.minScope)) {
            return { allowed: false, permissionKey: key, reason: 'SCOPE_TOO_NARROW' };
        }
        if (options.resource && !this.resourceInScope(principal, widest, options.resource, options.principalAreaIds)) {
            return { allowed: false, permissionKey: key, reason: 'RESOURCE_OUT_OF_SCOPE' };
        }
        return { allowed: true, permissionKey: key, reason: 'GRANTED' };
    }
    authorize(principal, key, options = {}) {
        return this.decide(principal, key, options);
    }
    resourceInScope(principal, scope, resource, principalAreaIds = []) {
        switch (scope) {
            case 'All':
                return true;
            case 'Area':
                return (resource.areaIds ?? []).some((a) => principalAreaIds.includes(a));
            case 'Assigned':
                return (resource.assignedUserIds ?? []).includes(principal.userId);
            case 'Own':
                return resource.ownerUserId === principal.userId;
        }
    }
};
exports.PolicyService = PolicyService;
exports.PolicyService = PolicyService = __decorate([
    (0, common_1.Injectable)()
], PolicyService);
//# sourceMappingURL=policy.service.js.map