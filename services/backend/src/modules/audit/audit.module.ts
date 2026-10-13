import { Module } from '@nestjs/common';
import { AuditWriter } from './audit-writer';

@Module({ providers: [AuditWriter] })
export class AuditModule {}
