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
exports.PartitionService = void 0;
const common_1 = require("@nestjs/common");
const database_service_1 = require("./database.service");
let PartitionService = class PartitionService {
    db;
    constructor(db) {
        this.db = db;
    }
    async ensureAhead(months = 6, from = new Date()) {
        const parents = await this.db.query(`SELECT p.partrelid::regclass::text AS name FROM pg_partitioned_table p WHERE p.partstrat = 'r' ORDER BY 1`);
        let created = 0;
        for (const parent of parents.rows) {
            for (let i = 0; i <= months; i++) {
                const start = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + i, 1)).toISOString().slice(0, 10);
                const before = await this.db.query(`SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = $1::regclass`, [parent.name]);
                await this.db.query('SELECT platform.ensure_month_partition($1::regclass, $2::date)', [parent.name, start]);
                const after = await this.db.query(`SELECT count(*)::int AS n FROM pg_inherits WHERE inhparent = $1::regclass`, [parent.name]);
                created += after.rows[0].n - before.rows[0].n;
            }
        }
        return created;
    }
};
exports.PartitionService = PartitionService;
exports.PartitionService = PartitionService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], PartitionService);
//# sourceMappingURL=partition.service.js.map