"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var PolicyGuard_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyGuard = exports.RequireAnyPermission = exports.RequirePermission = exports.REQUIRE_PERMISSION = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const node_crypto_1 = require("node:crypto");
const audit_service_1 = require("../audit/audit.service");
const database_service_1 = require("../db/database.service");
const policy_service_1 = require("./policy.service");
exports.REQUIRE_PERMISSION = 'bbda:require-permission';
const RequirePermission = (key, minScope) => (0, common_1.SetMetadata)(exports.REQUIRE_PERMISSION, [{ key, minScope }]);
exports.RequirePermission = RequirePermission;
const RequireAnyPermission = (...alternatives) => (0, common_1.SetMetadata)(exports.REQUIRE_PERMISSION, alternatives);
exports.RequireAnyPermission = RequireAnyPermission;
let PolicyGuard = PolicyGuard_1 = class PolicyGuard {
    reflector;
    policy;
    db;
    audit;
    logger = new common_1.Logger(PolicyGuard_1.name);
    constructor(reflector, policy, db, audit) {
        this.reflector = reflector;
        this.policy = policy;
        this.db = db;
        this.audit = audit;
    }
    async canActivate(context) {
        if (context.getType() !== 'http')
            return true;
        const required = this.reflector.getAllAndOverride(exports.REQUIRE_PERMISSION, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (!required || required.length === 0)
            return true;
        const request = context.switchToHttp().getRequest();
        if (!request.principal)
            throw new common_1.UnauthorizedException({ code: 'UNAUTHENTICATED' });
        const principal = request.principal;
        const decisions = required.map((r) => this.policy.decide(principal, r.key, { minScope: r.minScope }));
        if (decisions.some((d) => d.allowed))
            return true;
        const stepUp = decisions.find((d) => d.reason === 'STEP_UP_REQUIRED');
        const denied = stepUp ?? decisions[0];
        await this.recordDenial(principal, denied, `${request.method} ${request.url.split('?')[0]}`);
        if (stepUp)
            throw new common_1.ForbiddenException({ code: 'STEP_UP_REQUIRED', permission: stepUp.permissionKey });
        throw new common_1.ForbiddenException({ code: 'FORBIDDEN', permission: denied.permissionKey });
    }
    async recordDenial(principal, decision, endpoint) {
        try {
            await this.db.transaction((tx) => this.audit.record(tx, {
                category: 'PERMISSION', action: 'PERMISSION_DENIED', result: 'DENIED', actorUserId: principal.userId, actorRole: principal.role,
                permissionUsed: decision.permissionKey, reasonCode: decision.reason, reasonText: endpoint, correlationId: (0, node_crypto_1.randomUUID)(),
            }));
        }
        catch (error) {
            this.logger.warn(`could not record denied attempt: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
};
exports.PolicyGuard = PolicyGuard;
exports.PolicyGuard = PolicyGuard = PolicyGuard_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __param(3, (0, common_1.Inject)(audit_service_1.AuditService)),
    __metadata("design:paramtypes", [core_1.Reflector,
        policy_service_1.PolicyService,
        database_service_1.DatabaseService,
        audit_service_1.AuditService])
], PolicyGuard);
//# sourceMappingURL=policy.guard.js.map