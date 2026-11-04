"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorModelFilter = void 0;
const common_1 = require("@nestjs/common");
const node_crypto_1 = require("node:crypto");
const state_machine_1 = require("../status/state-machine");
let ErrorModelFilter = class ErrorModelFilter {
    catch(exception, host) {
        const reply = host.switchToHttp().getResponse();
        const correlationId = (0, node_crypto_1.randomUUID)();
        if (exception instanceof state_machine_1.InvalidTransitionError) {
            return reply.status(422).send({ code: 'INVALID_TRANSITION', correlation_id: correlationId });
        }
        if (exception instanceof common_1.HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();
            const code = typeof body === 'object' && body !== null && 'code' in body ? body.code : undefined;
            return reply.status(status).send({
                code: code ?? common_1.HttpStatus[status] ?? 'ERROR',
                message: typeof body === 'string' ? body : body.message,
                correlation_id: correlationId,
            });
        }
        new common_1.Logger('Errors').error(`${correlationId} ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`);
        return reply.status(500).send({ code: 'INTERNAL_ERROR', correlation_id: correlationId });
    }
};
exports.ErrorModelFilter = ErrorModelFilter;
exports.ErrorModelFilter = ErrorModelFilter = __decorate([
    (0, common_1.Catch)()
], ErrorModelFilter);
//# sourceMappingURL=http-exception.filter.js.map