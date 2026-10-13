import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { APP_CONFIG, AppConfig } from '../config/app-config';
import { Principal } from '../policy/policy.types';
import { IDEMPOTENCY_REPOSITORY, IdempotencyRepository } from './idempotency.repository';

export const ANONYMOUS_USER_ID = '00000000-0000-0000-0000-000000000000';
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface HttpRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  principal?: Principal;
}

interface HttpResponse {
  statusCode: number;
  status(code: number): HttpResponse;
}

export function hashRequest(body: unknown): string {
  const empty = body == null || (typeof body === 'object' && Object.keys(body).length === 0);
  return createHash('sha256')
    .update(JSON.stringify(empty ? null : body))
    .digest('hex');
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @Inject(IDEMPOTENCY_REPOSITORY) private readonly repository: IdempotencyRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    if (!MUTATING.has(request.method)) return next.handle();

    const header = request.headers['idempotency-key'];
    const key = Array.isArray(header) ? header[0] : header;
    if (!key || key.length < 8 || key.length > 128) {
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
    }

    const userId = request.principal?.userId ?? ANONYMOUS_USER_ID;
    const endpoint = `${request.method} ${request.url.split('?')[0]}`;
    const requestHash = hashRequest(request.body);
    const expiresAt = new Date(Date.now() + this.config.idempotencyTtlHours * 3_600_000);
    const response = http.getResponse<HttpResponse>();

    return from(this.repository.begin({ userId, key, endpoint, requestHash, expiresAt })).pipe(
      switchMap((outcome) => {
        if (outcome.created) {
          return next.handle().pipe(
            tap((body) => {
              void this.repository.complete(userId, key, response.statusCode, body);
            }),
            catchError((error) => {
              void this.repository.fail(userId, key);
              return throwError(() => error);
            }),
          );
        }
        const { existing } = outcome;
        if (existing.endpoint !== endpoint || existing.requestHash !== requestHash) {
          return throwError(() => new UnprocessableEntityException({ code: 'IDEMPOTENCY_KEY_REUSED' }));
        }
        if (existing.status === 'In progress') {
          return throwError(() => new ConflictException({ code: 'IDEMPOTENT_REQUEST_IN_PROGRESS' }));
        }
        if (existing.status === 'Failed') {
          return throwError(() => new ConflictException({ code: 'IDEMPOTENT_REQUEST_FAILED_USE_NEW_KEY' }));
        }
        response.status(existing.responseCode ?? 200);
        return of(existing.responseBody);
      }),
    );
  }
}
