"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const platform_socket_io_1 = require("@nestjs/platform-socket.io");
const common_1 = require("@nestjs/common");
const identity_public_1 = require("../modules/identity/identity.public");
const audit_module_1 = require("../platform/audit/audit.module");
const app_config_1 = require("../platform/config/app-config");
const database_module_1 = require("../platform/db/database.module");
const realtime_gateway_1 = require("../platform/http/realtime.gateway");
const outbox_module_1 = require("../platform/outbox/outbox.module");
let RealtimeModule = class RealtimeModule {
};
RealtimeModule = __decorate([
    (0, common_1.Module)({ imports: [database_module_1.DatabaseModule, outbox_module_1.OutboxModule, audit_module_1.AuditPlatformModule, identity_public_1.IdentityCoreModule], providers: [realtime_gateway_1.RealtimeGateway] })
], RealtimeModule);
async function bootstrap() {
    const config = (0, app_config_1.loadConfig)();
    const app = await core_1.NestFactory.create(RealtimeModule, new platform_fastify_1.FastifyAdapter());
    app.useWebSocketAdapter(new platform_socket_io_1.IoAdapter(app));
    await app.listen(config.port + 1, '0.0.0.0');
}
void bootstrap();
//# sourceMappingURL=realtime.js.map