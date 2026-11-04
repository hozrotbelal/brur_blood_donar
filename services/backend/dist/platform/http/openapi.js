"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOpenApiDocument = buildOpenApiDocument;
const swagger_1 = require("@nestjs/swagger");
function buildOpenApiDocument(app) {
    return swagger_1.SwaggerModule.createDocument(app, new swagger_1.DocumentBuilder().setTitle('BBDA API').setVersion('1').addBearerAuth().build());
}
//# sourceMappingURL=openapi.js.map