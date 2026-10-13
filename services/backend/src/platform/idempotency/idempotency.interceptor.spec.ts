import { ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { AppConfig } from '../config/app-config';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import { InMemoryIdempotencyRepository } from './idempotency.repository';

const config = { idempotencyTtlHours: 24 } as AppConfig;

function context(method: string, headers: Record<string, string>, body: unknown) {
  const response = { statusCode: 201, status(code: number) { this.statusCode = code; return this; } };
  const request = { method, url: '/api/v1/requests', headers, body, principal: { userId: 'u1' } };
  const ctx = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { ctx, response };
}

describe('IdempotencyInterceptor', () => {
  const run = async (interceptor: IdempotencyInterceptor, ctx: ExecutionContext, handler: () => unknown) =>
    lastValueFrom(interceptor.intercept(ctx, { handle: () => of(handler()) }));

  it('requires the header on mutating calls', () => {
    const interceptor = new IdempotencyInterceptor(new InMemoryIdempotencyRepository(), config);
    expect(() => interceptor.intercept(context('POST', {}, {}).ctx, { handle: () => of(1) })).toThrow();
  });

  it('passes safe methods through', async () => {
    const interceptor = new IdempotencyInterceptor(new InMemoryIdempotencyRepository(), config);
    expect(await run(interceptor, context('GET', {}, undefined).ctx, () => 'ok')).toBe('ok');
  });

  it('replays the stored response without running the handler twice', async () => {
    const interceptor = new IdempotencyInterceptor(new InMemoryIdempotencyRepository(), config);
    const handler = jest.fn(() => ({ id: 'r1' }));
    const headers = { 'idempotency-key': 'key-12345' };
    expect(await run(interceptor, context('POST', headers, { a: 1 }).ctx, handler)).toEqual({ id: 'r1' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(await run(interceptor, context('POST', headers, { a: 1 }).ctx, handler)).toEqual({ id: 'r1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('rejects the same key with a different body', async () => {
    const interceptor = new IdempotencyInterceptor(new InMemoryIdempotencyRepository(), config);
    const headers = { 'idempotency-key': 'key-12345' };
    await run(interceptor, context('POST', headers, { a: 1 }).ctx, () => 'x');
    await new Promise((resolve) => setImmediate(resolve));
    await expect(run(interceptor, context('POST', headers, { a: 2 }).ctx, () => 'x')).rejects.toMatchObject({
      status: 422,
    });
  });
});
