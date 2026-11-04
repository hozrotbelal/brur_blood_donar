"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemoryIdempotencyRepository = exports.PgIdempotencyRepository = exports.IDEMPOTENCY_REPOSITORY = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("../db/database.service");
exports.IDEMPOTENCY_REPOSITORY = Symbol('IDEMPOTENCY_REPOSITORY');
let PgIdempotencyRepository = class PgIdempotencyRepository {
    db;
    constructor(db) {
        this.db = db;
    }
    async begin(input) {
        await this.db.query('DELETE FROM idn.idempotency_key WHERE user_id = $1 AND key = $2 AND expires_at < now()', [
            input.userId,
            input.key,
        ]);
        const inserted = await this.db.query(`INSERT INTO idn.idempotency_key (user_id, key, endpoint, request_hash, status, expires_at)
       VALUES ($1, $2, $3, $4, 'In progress', $5)
       ON CONFLICT (user_id, key) DO NOTHING`, [input.userId, input.key, input.endpoint, input.requestHash, input.expiresAt]);
        if (inserted.rowCount === 1)
            return { created: true };
        const { rows } = await this.db.query('SELECT status, endpoint, request_hash, response_code, response_body FROM idn.idempotency_key WHERE user_id = $1 AND key = $2', [input.userId, input.key]);
        const row = rows[0];
        return {
            created: false,
            existing: {
                status: row.status,
                endpoint: row.endpoint,
                requestHash: row.request_hash,
                responseCode: row.response_code,
                responseBody: row.response_body,
            },
        };
    }
    async complete(userId, key, responseCode, responseBody) {
        await this.db.query(`UPDATE idn.idempotency_key SET status = 'Completed', response_code = $3, response_body = $4::jsonb
       WHERE user_id = $1 AND key = $2`, [userId, key, responseCode, JSON.stringify(responseBody ?? null)]);
    }
    async fail(userId, key) {
        await this.db.query("UPDATE idn.idempotency_key SET status = 'Failed' WHERE user_id = $1 AND key = $2", [
            userId,
            key,
        ]);
    }
};
exports.PgIdempotencyRepository = PgIdempotencyRepository;
exports.PgIdempotencyRepository = PgIdempotencyRepository = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], PgIdempotencyRepository);
class InMemoryIdempotencyRepository {
    rows = new Map();
    async begin(input) {
        const id = `${input.userId}:${input.key}`;
        const existing = this.rows.get(id);
        if (existing)
            return { created: false, existing };
        this.rows.set(id, {
            status: 'In progress',
            endpoint: input.endpoint,
            requestHash: input.requestHash,
            responseCode: null,
            responseBody: null,
        });
        return { created: true };
    }
    async complete(userId, key, responseCode, responseBody) {
        const row = this.rows.get(`${userId}:${key}`);
        if (row)
            Object.assign(row, { status: 'Completed', responseCode, responseBody });
    }
    async fail(userId, key) {
        const row = this.rows.get(`${userId}:${key}`);
        if (row)
            row.status = 'Failed';
    }
}
exports.InMemoryIdempotencyRepository = InMemoryIdempotencyRepository;
//# sourceMappingURL=idempotency.repository.js.map