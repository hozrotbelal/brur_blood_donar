import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

interface Reply {
  type(contentType: string): Reply;
  send(body: unknown): void;
}

const ASSETS: Record<string, string> = {
  'swagger-ui-bundle.js': 'application/javascript; charset=utf-8',
  'swagger-ui-standalone-preset.js': 'application/javascript; charset=utf-8',
  'swagger-ui.css': 'text/css; charset=utf-8',
  'favicon-32x32.png': 'image/png',
};

const page = (base: string, specUrl: string) => `<!doctype html>
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

export function registerSwaggerUi(app: INestApplication, base: string, specUrl: string): void {
  const dist = join(require.resolve('swagger-ui-dist/package.json'), '..');
  const adapter = app.getHttpAdapter();
  const html = page(base, specUrl);
  adapter.get(base, (_req: unknown, reply: Reply) => reply.type('text/html; charset=utf-8').send(html));
  for (const [name, contentType] of Object.entries(ASSETS)) {
    const body = readFileSync(join(dist, name));
    adapter.get(`${base}/${name}`, (_req: unknown, reply: Reply) => reply.type(contentType).send(body));
  }
}
