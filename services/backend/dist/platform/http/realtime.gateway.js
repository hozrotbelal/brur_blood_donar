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
var RealtimeGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeGateway = exports.userRoom = void 0;
const common_1 = require("@nestjs/common");
const websockets_1 = require("@nestjs/websockets");
const bearer_authenticator_1 = require("../security/bearer-authenticator");
const userRoom = (userId) => `user:${userId}`;
exports.userRoom = userRoom;
let RealtimeGateway = RealtimeGateway_1 = class RealtimeGateway {
    authenticator;
    logger = new common_1.Logger(RealtimeGateway_1.name);
    constructor(authenticator) {
        this.authenticator = authenticator;
    }
    async handleConnection(client) {
        const principal = await this.resolve(client);
        if (!principal) {
            client.disconnect(true);
            return;
        }
        client.data.principal = principal;
        await client.join((0, exports.userRoom)(principal.userId));
    }
    async resolve(client) {
        const fromAuth = client.handshake.auth?.token;
        const header = client.handshake.headers?.authorization;
        const bearer = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;
        const token = fromAuth ?? bearer;
        if (!token)
            return null;
        try {
            return await this.authenticator.authenticate(token);
        }
        catch (error) {
            this.logger.warn(`realtime handshake failed: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }
};
exports.RealtimeGateway = RealtimeGateway;
exports.RealtimeGateway = RealtimeGateway = RealtimeGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({ namespace: '/realtime' }),
    __param(0, (0, common_1.Inject)(bearer_authenticator_1.BearerAuthenticator)),
    __metadata("design:paramtypes", [bearer_authenticator_1.BearerAuthenticator])
], RealtimeGateway);
//# sourceMappingURL=realtime.gateway.js.map