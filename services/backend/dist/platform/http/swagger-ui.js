"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSwaggerUi = registerSwaggerUi;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const ASSETS = {
    'swagger-ui-bundle.js': 'application/javascript; charset=utf-8',
    'swagger-ui-standalone-preset.js': 'application/javascript; charset=utf-8',
    'swagger-ui.css': 'text/css; charset=utf-8',
    'favicon-32x32.png': 'image/png',
};
const page = (base, specUrl) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>BBDA API</title>
<link rel="stylesheet" href="${base}/swagger-ui.css"><link rel="icon" href="${base}/favicon-32x32.png">
</head>
<body><div id="swagger-ui"></div>
<script src="${base}/swagger-ui-bundle.js"></script>
<script src="${base}/swagger-ui-standalone-preset.js"></script>
<script>
window.ui = SwaggerUIBundle({ url: '${specUrl}', dom_id: '#swagger-ui', deepLinking: true, persistAuthorization: true,
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset], layout: 'StandaloneLayout' });
</script>
</body></html>`;
function registerSwaggerUi(app, base, specUrl) {
    const dist = (0, node_path_1.join)(require.resolve('swagger-ui-dist/package.json'), '..');
    const adapter = app.getHttpAdapter();
    const html = page(base, specUrl);
    adapter.get(base, (_req, reply) => reply.type('text/html; charset=utf-8').send(html));
    for (const [name, contentType] of Object.entries(ASSETS)) {
        const body = (0, node_fs_1.readFileSync)((0, node_path_1.join)(dist, name));
        adapter.get(`${base}/${name}`, (_req, reply) => reply.type(contentType).send(body));
    }
}
//# sourceMappingURL=swagger-ui.js.map