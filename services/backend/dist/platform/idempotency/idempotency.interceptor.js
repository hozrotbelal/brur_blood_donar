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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdempotencyInterceptor = exports.ANONYMOUS_USER_ID = void 0;
exports.hashRequest = hashRequest;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const rxjs_1 = require("rxjs");
const operators_1 = require("rxjs/operators");
const app_config_1 = require("../config/app-config");
const idempotency_repository_1 = require("./idempotency.repository");
exports.ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000000';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const EXEMPT_PREFIXES = ['/api/v1/auth/', '/api/v1/web/auth/'];
function hashRequest(body) {
    const empty = body == null || (typeof body === 'object' && Object.keys(body).length === 0);
    return (0, node_crypto_1.createHash)('sha256')
        .update(JSON.stringify(empty ? null : body))
        .digest('hex');
}
let IdempotencyInterceptor = class IdempotencyInterceptor {
    repository;
    config;
    constructor(repository, config) {
        this.repository = repository;
        this.config = config;
    }
    intercept(context, next) {
        if (context.getType() !== 'http')
            return next.handle();
        const http = context.switchToHttp();
        const request = http.getRequest();
        const path = request.url?.split('?')[0] ?? '';
        if (!MUTATING.has(request.method) || EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix)))
            return next.handle();
        const header = request.headers['idempotency-key'];
        const key = Array.isArray(header) ? header[0] : header;
        if (!key || key.length < 8 || key.length > 128) {
            throw new common_1.BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
        }
        const userId = request.principal?.userId ?? exports.ANONYMOUS_USER_ID;
        const endpoint = `${request.method} ${request.url.split('?')[0]}`;
        const requestHash = hashRequest(request.body);
        const expiresAt = new Date(Date.now() + this.config.idempotencyTtlHours * 3_600_000);
        const response = http.getResponse();
        return (0, rxjs_1.from)(this.repository.begin({ userId, key, endpoint, requestHash, expiresAt })).pipe((0, operators_1.switchMap)((outcome) => {
            if (outcome.created) {
                return next.handle().pipe((0, operators_1.tap)((body) => {
                    void this.repository.complete(userId, key, response.statusCode, body);
                }), (0, operators_1.catchError)((error) => {
                    void this.repository.fail(userId, key);
                    return (0, rxjs_1.throwError)(() => error);
                }));
            }
            const { existing } = outcome;
            if (existing.endpoint !== endpoint || existing.requestHash !== requestHash) {
                return (0, rxjs_1.throwError)(() => new common_1.UnprocessableEntityException({ code: 'IDEMPOTENCY_KEY_REUSED' }));
            }
            if (existing.status === 'In progress') {
                return (0, rxjs_1.throwError)(() => new common_1.ConflictException({ code: 'IDEMPOTENT_REQUEST_IN_PROGRESS' }));
            }
            if (existing.status === 'Failed') {
                return (0, rxjs_1.throwError)(() => new common_1.ConflictException({ code: 'IDEMPOTENT_REQUEST_FAILED_USE_NEW_KEY' }));
            }
            response.status(existing.responseCode ?? 200);
            return (0, rxjs_1.of)(existing.responseBody);
        }));
    }
};
exports.IdempotencyInterceptor = IdempotencyInterceptor;
exports.IdempotencyInterceptor = IdempotencyInterceptor = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(idempotency_repository_1.IDEMPOTENCY_REPOSITORY)),
    __param(1, (0, common_1.Inject)(app_config_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object, Object])
], IdempotencyInterceptor);
//# sourceMappingURL=idempotency.interceptor.js.map