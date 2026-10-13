import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../db/database.service';
import { Public } from '../policy/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  @Get()
  async check() {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException({ status: 'down', database: 'down' });
    }
    return { status: 'ok', database: 'up' };
  }
}
