import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Module } from '@nestjs/common';
import { loadConfig } from '../platform/config/app-config';
import { RealtimeGateway } from '../platform/http/realtime.gateway';

@Module({ providers: [RealtimeGateway] })
class RealtimeModule {}

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(RealtimeModule, new FastifyAdapter());
  app.useWebSocketAdapter(new IoAdapter(app));
  await app.listen(config.port + 1, '0.0.0.0');
}

void bootstrap();
