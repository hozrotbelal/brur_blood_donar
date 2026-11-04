import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, loadConfig } from '../config/app-config';
import { DatabaseService } from './database.service';
import { PartitionService } from './partition.service';

@Global()
@Module({
  providers: [{ provide: APP_CONFIG, useFactory: () => loadConfig() }, DatabaseService, PartitionService],
  exports: [APP_CONFIG, DatabaseService, PartitionService],
})
export class DatabaseModule {}
