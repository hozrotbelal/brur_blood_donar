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
exports.FacilityPageDto = exports.FacilityDto = exports.FacilityQueryDto = exports.FACILITY_TYPES = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.FACILITY_TYPES = ['HOSPITAL', 'COLLECTION_SERVICE', 'CAMPAIGN_SITE'];
class FacilityQueryDto {
    areaId;
    type;
    q;
    limit;
    offset;
}
exports.FacilityQueryDto = FacilityQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], FacilityQueryDto.prototype, "areaId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: exports.FACILITY_TYPES }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(exports.FACILITY_TYPES),
    __metadata("design:type", String)
], FacilityQueryDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Matches English or Bangla name' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], FacilityQueryDto.prototype, "q", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 50, maximum: 200 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(200),
    __metadata("design:type", Number)
], FacilityQueryDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: 0 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    __metadata("design:type", Number)
], FacilityQueryDto.prototype, "offset", void 0);
class FacilityDto {
    id;
    type;
    nameEn;
    nameBn;
    areaId;
    isVerified;
    supportsBooking;
}
exports.FacilityDto = FacilityDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FacilityDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.FACILITY_TYPES }),
    __metadata("design:type", String)
], FacilityDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FacilityDto.prototype, "nameEn", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], FacilityDto.prototype, "nameBn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FacilityDto.prototype, "areaId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], FacilityDto.prototype, "isVerified", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], FacilityDto.prototype, "supportsBooking", void 0);
class FacilityPageDto {
    items;
    total;
    limit;
    offset;
}
exports.FacilityPageDto = FacilityPageDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: [FacilityDto] }),
    __metadata("design:type", Array)
], FacilityPageDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], FacilityPageDto.prototype, "total", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], FacilityPageDto.prototype, "limit", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], FacilityPageDto.prototype, "offset", void 0);
//# sourceMappingURL=facility.dto.js.map