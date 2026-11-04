"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const app_module_1 = require("../app.module");
const openapi_1 = require("../platform/http/openapi");
async function exportDocument() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter(), { logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    const document = (0, openapi_1.buildOpenApiDocument)(app);
    const target = process.argv[2] ?? (0, node_path_1.join)(__dirname, '../../../../packages/api-contract/openapi.json');
    (0, node_fs_1.writeFileSync)(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    await app.close();
    console.log(`OpenAPI written to ${target}`);
}
void exportDocument();
//# sourceMappingURL=export-openapi.js.map