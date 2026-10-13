import { Global, Module } from '@nestjs/common';
import { IDEMPOTENCY_REPOSITORY, PgIdempotencyRepository } from './idempotency.repository';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Global()
@Module({
  providers: [
    PgIdempotencyRepository,
    { provide: IDEMPOTENCY_REPOSITORY, useExisting: PgIdempotencyRepository },
    IdempotencyInterceptor,
  ],
  exports: [IDEMPOTENCY_REPOSITORY, IdempotencyInterceptor],
})
export class IdempotencyModule {}
