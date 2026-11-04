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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AreaPageDto = exports.AreaDto = exports.AreaQueryDto = exports.AREA_LEVELS = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.AREA_LEVELS = ['DIVISION', 'DISTRICT', 'UPAZILA', 'UNION'];
class AreaQueryDto {
    level;
    parentId;
    q;
    limit;
    offset;
}
exports.AreaQueryDto = AreaQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.AREA_LEVELS }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.AREA_LEVELS),
    __metadata("design:type", String)
], AreaQueryDto.prototype, "level", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], AreaQueryDto.prototype, "parentId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Matches code, English or Bangla name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], AreaQueryDto.prototype, "q", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 50, maximum: 200 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], AreaQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], AreaQueryDto.prototype, "offset", void 0);
class AreaDto {
    id;
    parentId;
    level;
    code;
    nameEn;
    nameBn;
}
exports.AreaDto = AreaDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AreaDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], AreaDto.prototype, "parentId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.AREA_LEVELS }),
    __metadata("design:type", String)
], AreaDto.prototype, "level", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AreaDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AreaDto.prototype, "nameEn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AreaDto.prototype, "nameBn", void 0);
class AreaPageDto {
    items;
    total;
    limit;
    offset;
}
exports.AreaPageDto = AreaPageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [AreaDto] }),
    __metadata("design:type", Array)
], AreaPageDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], AreaPageDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], AreaPageDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], AreaPageDto.prototype, "offset", void 0);
//# sourceMappingURL=area.dto.js.map