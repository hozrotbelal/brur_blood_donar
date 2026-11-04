"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const app_module_1 = require("../app.module");
const app_config_1 = require("../platform/config/app-config");
const openapi_1 = require("../platform/http/openapi");
const swagger_ui_1 = require("../platform/http/swagger-ui");
async function bootstrap() {
    const config = (0, app_config_1.loadConfig)();
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter({ trustProxy: true }));
    app.useBodyParser('application/json', {}, (_req, body, done) => {
        if (!body || body.length === 0)
            return done(null, {});
        try {
            done(null, JSON.parse(body.toString()));
        }
        catch {
            done(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }), undefined);
        }
    });
    if (config.webOrigin) {
        app.enableCors({
            origin: config.webOrigin,
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
            allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-CSRF-Token'],
        });
    }
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const document = (0, openapi_1.buildOpenApiDocument)(app);
    app.getHttpAdapter().get('/api/v1/openapi.json', (_req, reply) => reply.send(document));
    if (config.nodeEnv !== 'production')
        (0, swagger_ui_1.registerSwaggerUi)(app, '/api/v1/docs', '/api/v1/openapi.json');
    await app.listen(config.port, '0.0.0.0');
}
void bootstrap();
//# sourceMappingURL=api.js.map