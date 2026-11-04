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
exports.AreaService = void 0;
const common_1 = require("@nestjs/common");
const drizzle_orm_1 = require("drizzle-orm");
const database_service_1 = require("../../platform/db/database.service");
const schema_1 = require("./schema");
let AreaService = class AreaService {
    db;
    constructor(db) {
        this.db = db;
    }
    async list(query) {
        const limit = query.limit ?? 50;
        const offset = query.offset ?? 0;
        const term = query.q?.trim();
        const pattern = term ? `%${term}%` : undefined;
        const rows = await this.db.orm
            .select({
            id: schema_1.area.id, parentId: schema_1.area.parentId, level: schema_1.area.level, code: schema_1.area.code, nameEn: schema_1.area.nameEn, nameBn: schema_1.area.nameBn,
            total: (0, drizzle_orm_1.sql) `count(*) over()`.mapWith(Number),
        })
            .from(schema_1.area)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.area.isActive, true), query.level ? (0, drizzle_orm_1.eq)(schema_1.area.level, query.level) : undefined, query.parentId ? (0, drizzle_orm_1.eq)(schema_1.area.parentId, query.parentId) : undefined, pattern ? (0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(schema_1.area.code, pattern), (0, drizzle_orm_1.ilike)(schema_1.area.nameEn, pattern), (0, drizzle_orm_1.ilike)(schema_1.area.nameBn, pattern)) : undefined))
            .orderBy((0, drizzle_orm_1.asc)(schema_1.area.level), (0, drizzle_orm_1.asc)(schema_1.area.nameEn))
            .limit(limit)
            .offset(offset);
        const total = rows[0]?.total ?? 0;
        const items = rows.map(({ total: _t, ...row }) => row);
        return { items, total, limit, offset };
    }
};
exports.AreaService = AreaService;
exports.AreaService = AreaService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(database_service_1.DatabaseService)),
    __metadata("design:paramtypes", [database_service_1.DatabaseService])
], AreaService);
//# sourceMappingURL=area.service.js.map