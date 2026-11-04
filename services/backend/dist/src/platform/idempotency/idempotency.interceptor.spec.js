"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rxjs_1 = require("rxjs");
const idempotency_interceptor_1 = require("./idempotency.interceptor");
const idempotency_repository_1 = require("./idempotency.repository");
const config = { idempotencyTtlHours: 24 };
function context(method, headers, body) {
    const response = { statusCode: 201, status(code) { this.statusCode = code; return this; } };
    const request = { method, url: '/api/v1/requests', headers, body, principal: { userId: 'u1' } };
    const ctx = {
        getType: () => 'http',
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
    };
    return { ctx, response };
}
describe('IdempotencyInterceptor', () => {
    const run = async (interceptor, ctx, handler) => (0, rxjs_1.lastValueFrom)(interceptor.intercept(ctx, { handle: () => (0, rxjs_1.of)(handler()) }));
    it('requires the header on mutating calls', () => {
        const interceptor = new idempotency_interceptor_1.IdempotencyInterceptor(new idempotency_repository_1.InMemoryIdempotencyRepository(), config);
        expect(() => interceptor.intercept(context('POST', {}, {}).ctx, { handle: () => (0, rxjs_1.of)(1) })).toThrow();
    });
    it('passes safe methods through', async () => {
        const interceptor = new idempotency_interceptor_1.IdempotencyInterceptor(new idempotency_repository_1.InMemoryIdempotencyRepository(), config);
        expect(await run(interceptor, context('GET', {}, undefined).ctx, () => 'ok')).toBe('ok');
    });
    it('replays the stored response without running the handler twice', async () => {
        const interceptor = new idempotency_interceptor_1.IdempotencyInterceptor(new idempotency_repository_1.InMemoryIdempotencyRepository(), config);
        const handler = jest.fn(() => ({ id: 'r1' }));
        const headers = { 'idempotency-key': 'key-12345' };
        expect(await run(interceptor, context('POST', headers, { a: 1 }).ctx, handler)).toEqual({ id: 'r1' });
        await new Promise((resolve) => setImmediate(resolve));
        expect(await run(interceptor, context('POST', headers, { a: 1 }).ctx, handler)).toEqual({ id: 'r1' });
        expect(handler).toHaveBeenCalledTimes(1);
    });
    it('rejects the same key with a different body', async () => {
        const interceptor = new idempotency_interceptor_1.IdempotencyInterceptor(new idempotency_repository_1.InMemoryIdempotencyRepository(), config);
        const headers = { 'idempotency-key': 'key-12345' };
        await run(interceptor, context('POST', headers, { a: 1 }).ctx, () => 'x');
        await new Promise((resolve) => setImmediate(resolve));
        await expect(run(interceptor, context('POST', headers, { a: 2 }).ctx, () => 'x')).rejects.toMatchObject({
            status: 422,
        });
    });
});
//# sourceMappingURL=idempotency.interceptor.spec.js.map