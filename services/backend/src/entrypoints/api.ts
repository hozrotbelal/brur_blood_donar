import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import { loadConfig } from '../platform/config/app-config';

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
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('BBDA API').setVersion('1').addBearerAuth().build(),
  );
  app.getHttpAdapter().get('/api/v1/openapi.json', (_req: unknown, reply: { send(body: unknown): void }) =>
    reply.send(document),
  );

  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
