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
exports.ConsentViewDto = exports.DonorProfileDto = exports.ApproximateLocationDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class ApproximateLocationDto {
    latitude;
    longitude;
}
exports.ApproximateLocationDto = ApproximateLocationDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ApproximateLocationDto.prototype, "latitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ApproximateLocationDto.prototype, "longitude", void 0);
class DonorProfileDto {
    donorCode;
    bloodGroup;
    bloodGroupStatus;
    areaId;
    travelRadiusKm;
    lastDonationDate;
    provisionalNextContactDate;
    nextContactBasis;
    donorStatus;
    locationSource;
    approximateLocation;
    version;
}
exports.DonorProfileDto = DonorProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DonorProfileDto.prototype, "donorCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], DonorProfileDto.prototype, "bloodGroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DonorProfileDto.prototype, "bloodGroupStatus", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], DonorProfileDto.prototype, "areaId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DonorProfileDto.prototype, "travelRadiusKm", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date' }),
    __metadata("design:type", Object)
], DonorProfileDto.prototype, "lastDonationDate", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date' }),
    __metadata("design:type", Object)
], DonorProfileDto.prototype, "provisionalNextContactDate", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DonorProfileDto.prototype, "nextContactBasis", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DonorProfileDto.prototype, "donorStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DonorProfileDto.prototype, "locationSource", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: ApproximateLocationDto }),
    __metadata("design:type", Object)
], DonorProfileDto.prototype, "approximateLocation", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DonorProfileDto.prototype, "version", void 0);
class ConsentViewDto {
    id;
    type;
    granted;
    policyVersion;
    capturedAt;
    channel;
    language;
}
exports.ConsentViewDto = ConsentViewDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ConsentViewDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ConsentViewDto.prototype, "type", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], ConsentViewDto.prototype, "granted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ConsentViewDto.prototype, "policyVersion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], ConsentViewDto.prototype, "capturedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ConsentViewDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ConsentViewDto.prototype, "language", void 0);
//# sourceMappingURL=profile-view.dto.js.map