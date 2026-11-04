import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Module } from '@nestjs/common';
import { IdentityCoreModule } from '../modules/identity/identity.public';
import { AuditPlatformModule } from '../platform/audit/audit.module';
import { loadConfig } from '../platform/config/app-config';
import { DatabaseModule } from '../platform/db/database.module';
import { RealtimeGateway } from '../platform/http/realtime.gateway';
import { OutboxModule } from '../platform/outbox/outbox.module';

@Module({ imports: [DatabaseModule, OutboxModule, AuditPlatformModule, IdentityCoreModule], providers: [RealtimeGateway] })
class RealtimeModule {}

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(RealtimeModule, new FastifyAdapter());
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(config.port + 1, '0.0.0.0');
}

void bootstrap();
