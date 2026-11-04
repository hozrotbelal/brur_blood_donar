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
exports.ResolveFlagDto = exports.PauseOutreachDto = exports.RejectRequestDto = exports.VerifyRequestDto = exports.RequestInformationDto = exports.REJECT_REASONS = exports.MISSING_ITEMS = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
exports.MISSING_ITEMS = [
    'DOCUMENT_MISSING', 'DOCUMENT_ILLEGIBLE', 'BLOOD_GROUP_MISMATCH', 'COMPONENT_MISMATCH', 'FACILITY_UNCLEAR', 'CONTACT_UNREACHABLE', 'OTHER',
];
exports.REJECT_REASONS = ['DUPLICATE', 'SUSPECTED_MISUSE', 'NO_GENUINE_NEED', 'DOCUMENT_INVALID', 'UNREACHABLE', 'OTHER'];
class RequestInformationDto {
    items;
    message;
}
exports.RequestInformationDto = RequestInformationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.MISSING_ITEMS, isArray: true }),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMinSize)(1),
    (0, class_validator_1.ArrayMaxSize)(exports.MISSING_ITEMS.length),
    (0, class_validator_1.ArrayUnique)(),
    (0, class_validator_1.IsIn)(exports.MISSING_ITEMS, { each: true }),
    __metadata("design:type", Array)
], RequestInformationDto.prototype, "items", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], RequestInformationDto.prototype, "message", void 0);
class VerifyRequestDto {
    documentLegible;
    bloodGroupAndComponentMatch;
    facilityExists;
    representativeReachable;
    noDuplicate;
    urgencyConsistent;
}
exports.VerifyRequestDto = VerifyRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], VerifyRequestDto.prototype, "documentLegible", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], VerifyRequestDto.prototype, "bloodGroupAndComponentMatch", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], VerifyRequestDto.prototype, "facilityExists", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], VerifyRequestDto.prototype, "representativeReachable", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], VerifyRequestDto.prototype, "noDuplicate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], VerifyRequestDto.prototype, "urgencyConsistent", void 0);
class RejectRequestDto {
    reasonCode;
    explanation;
}
exports.RejectRequestDto = RejectRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.REJECT_REASONS }),
    (0, class_validator_1.IsIn)(exports.REJECT_REASONS),
    __metadata("design:type", Object)
], RejectRequestDto.prototype, "reasonCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], RejectRequestDto.prototype, "explanation", void 0);
class PauseOutreachDto {
    reason;
}
exports.PauseOutreachDto = PauseOutreachDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], PauseOutreachDto.prototype, "reason", void 0);
class ResolveFlagDto {
    resolution;
    note;
}
exports.ResolveFlagDto = ResolveFlagDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Dismissed', 'Confirmed'] }),
    (0, class_validator_1.IsIn)(['Dismissed', 'Confirmed']),
    __metadata("design:type", String)
], ResolveFlagDto.prototype, "resolution", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ResolveFlagDto.prototype, "note", void 0);
//# sourceMappingURL=review.dto.js.map