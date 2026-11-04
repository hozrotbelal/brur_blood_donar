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
exports.DatabaseService = void 0;
const common_1 = require("@nestjs/common");
const node_postgres_1 = require("drizzle-orm/node-postgres");
const pg_1 = require("pg");
const app_config_1 = require("../config/app-config");
let DatabaseService = class DatabaseService {
    pool;
    orm;
    constructor(config) {
        this.pool = new pg_1.Pool({ connectionString: config.databaseUrl });
        this.orm = (0, node_postgres_1.drizzle)({ client: this.pool });
    }
    query(text, params) {
        return this.pool.query(text, params);
    }
    async transaction(work) {
        const client = await this.pool.connect();
        const tx = {
            query: (text, params) => client.query(text, params),
            orm: (0, node_postgres_1.drizzle)({ client }),
        };
        try {
            await client.query('BEGIN');
            const result = await work(tx);
            await client.query('COMMIT');
            return result;
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    onModuleDestroy() {
        return this.pool.end();
    }
};
exports.DatabaseService = DatabaseService;
exports.DatabaseService = DatabaseService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(app_config_1.APP_CONFIG)),
    __metadata("design:paramtypes", [Object])
], DatabaseService);
//# sourceMappingURL=database.service.js.map