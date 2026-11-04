import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../app.module';
import { loadConfig } from '../platform/config/app-config';
import { buildOpenApiDocument } from '../platform/http/openapi';
import { registerSwaggerUi } from '../platform/http/swagger-ui';

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ trustProxy: true }));
  app.useBodyParser('application/json', {}, (_req, body, done) => {
    if (!body || body.length === 0) return done(null, {});
    try {
      done(null, JSON.parse(body.toString()));
    } catch {
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
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const document = buildOpenApiDocument(app);
  app.getHttpAdapter().get('/api/v1/openapi.json', (_req: unknown, reply: { send(body: unknown): void }) =>
    reply.send(document),
  );
  if (config.nodeEnv !== 'production') registerSwaggerUi(app, '/api/v1/docs', '/api/v1/openapi.json');

  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
