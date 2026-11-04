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
exports.UrgentProblemDto = exports.UpdateRequestDto = exports.SupplyInformationDto = exports.CancelRequestDto = exports.CreateRequestDto = exports.CreatePatientDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
const RELATIONSHIPS = ['SELF', 'PARENT', 'CHILD', 'SPOUSE', 'SIBLING', 'OTHER_RELATIVE', 'FRIEND', 'OTHER'];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const COMPONENTS = ['WHOLE_BLOOD', 'RED_CELLS', 'PLATELETS', 'PLASMA', 'OTHER_AS_STATED'];
const URGENCIES = ['Routine', 'Urgent', 'Critical'];
const CANCEL_REASONS = ['NEED_MET_ELSEWHERE', 'NO_LONGER_REQUIRED', 'DUPLICATE', 'ENTERED_IN_ERROR', 'OTHER'];
const CONTACT_METHODS = ['APP_CHAT', 'PHONE_CALL', 'SMS'];
class CreatePatientDto {
    displayName;
    yearOfBirth;
    hospitalPatientRef;
    relationship;
}
exports.CreatePatientDto = CreatePatientDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(120),
    __metadata("design:type", String)
], CreatePatientDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1900),
    (0, class_validator_1.Max)(2100),
    __metadata("design:type", Number)
], CreatePatientDto.prototype, "yearOfBirth", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], CreatePatientDto.prototype, "hospitalPatientRef", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: RELATIONSHIPS }),
    (0, class_validator_1.IsIn)(RELATIONSHIPS),
    __metadata("design:type", Object)
], CreatePatientDto.prototype, "relationship", void 0);
class CreateRequestDto {
    patientId;
    requestedBloodGroup;
    component;
    quantityUnits;
    requiredBy;
    urgency;
    contactPhone;
    altContactPhone;
    hospitalFacilityId;
    collectionFacilityId;
    areaId;
    specialInstructions;
    preferredSupportContact;
    clientMutationId;
}
exports.CreateRequestDto = CreateRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "patientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: BLOOD_GROUPS }),
    (0, class_validator_1.IsIn)(BLOOD_GROUPS),
    __metadata("design:type", Object)
], CreateRequestDto.prototype, "requestedBloodGroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: COMPONENTS }),
    (0, class_validator_1.IsIn)(COMPONENTS),
    __metadata("design:type", Object)
], CreateRequestDto.prototype, "component", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ minimum: 1, maximum: 20 }),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], CreateRequestDto.prototype, "quantityUnits", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "requiredBy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: URGENCIES }),
    (0, class_validator_1.IsIn)(URGENCIES),
    __metadata("design:type", Object)
], CreateRequestDto.prototype, "urgency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '01712345678' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[+0-9\s-]{8,20}$/),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "contactPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[+0-9\s-]{8,20}$/),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "altContactPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "hospitalFacilityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "collectionFacilityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "areaId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "specialInstructions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: CONTACT_METHODS }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(CONTACT_METHODS),
    __metadata("design:type", Object)
], CreateRequestDto.prototype, "preferredSupportContact", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], CreateRequestDto.prototype, "clientMutationId", void 0);
class CancelRequestDto {
    reason;
}
exports.CancelRequestDto = CancelRequestDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: CANCEL_REASONS }),
    (0, class_validator_1.IsIn)(CANCEL_REASONS),
    __metadata("design:type", Object)
], CancelRequestDto.prototype, "reason", void 0);
class SupplyInformationDto {
    message;
}
exports.SupplyInformationDto = SupplyInformationDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], SupplyInformationDto.prototype, "message", void 0);
class UpdateRequestDto {
    contactPhone;
    altContactPhone;
    specialInstructions;
    quantityUnits;
    requiredBy;
    urgency;
    hospitalFacilityId;
    collectionFacilityId;
    requestedBloodGroup;
    component;
}
exports.UpdateRequestDto = UpdateRequestDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '01712345678' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[+0-9\s-]{8,20}$/),
    __metadata("design:type", String)
], UpdateRequestDto.prototype, "contactPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Matches)(/^[+0-9\s-]{8,20}$/),
    __metadata("design:type", String)
], UpdateRequestDto.prototype, "altContactPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UpdateRequestDto.prototype, "specialInstructions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], UpdateRequestDto.prototype, "quantityUnits", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], UpdateRequestDto.prototype, "requiredBy", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: URGENCIES }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(URGENCIES),
    __metadata("design:type", Object)
], UpdateRequestDto.prototype, "urgency", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateRequestDto.prototype, "hospitalFacilityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], UpdateRequestDto.prototype, "collectionFacilityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: BLOOD_GROUPS }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(BLOOD_GROUPS),
    __metadata("design:type", Object)
], UpdateRequestDto.prototype, "requestedBloodGroup", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: COMPONENTS }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(COMPONENTS),
    __metadata("design:type", Object)
], UpdateRequestDto.prototype, "component", void 0);
class UrgentProblemDto {
    note;
}
exports.UrgentProblemDto = UrgentProblemDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], UrgentProblemDto.prototype, "note", void 0);
//# sourceMappingURL=request.dto.js.map