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
exports.PatientListItemDto = exports.RequestChangeResultDto = exports.RequestChangeDto = exports.TimelineEntryDto = exports.RequestProgressDto = exports.RequestViewDto = exports.FacilityNameDto = exports.RequestMilestonesDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class RequestMilestonesDto {
    submittedAt;
    verifiedAt;
    searchStartedAt;
    donorWillingAt;
    donationReportedAt;
    outcomeConfirmedAt;
    fulfilledAt;
}
exports.RequestMilestonesDto = RequestMilestonesDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], RequestMilestonesDto.prototype, "submittedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], RequestMilestonesDto.prototype, "verifiedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], RequestMilestonesDto.prototype, "searchStartedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], RequestMilestonesDto.prototype, "donorWillingAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], RequestMilestonesDto.prototype, "donationReportedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], RequestMilestonesDto.prototype, "outcomeConfirmedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], RequestMilestonesDto.prototype, "fulfilledAt", void 0);
class FacilityNameDto {
    nameEn;
    nameBn;
}
exports.FacilityNameDto = FacilityNameDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FacilityNameDto.prototype, "nameEn", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], FacilityNameDto.prototype, "nameBn", void 0);
class RequestViewDto {
    id;
    referenceNo;
    patientId;
    patientName;
    patientRef;
    requestedBloodGroup;
    component;
    quantityUnits;
    requiredBy;
    urgency;
    priority;
    status;
    outreachPaused;
    cancelReason;
    contactPhone;
    altContactPhone;
    specialInstructions;
    hospitalFacilityId;
    collectionFacilityId;
    hospital;
    collectionDestination;
    outcomeConfidence;
    createdAt;
    updatedAt;
    version;
    milestones;
}
exports.RequestViewDto = RequestViewDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestViewDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "referenceNo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestViewDto.prototype, "patientId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestViewDto.prototype, "patientName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "patientRef", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestViewDto.prototype, "requestedBloodGroup", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestViewDto.prototype, "component", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], RequestViewDto.prototype, "quantityUnits", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], RequestViewDto.prototype, "requiredBy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestViewDto.prototype, "urgency", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestViewDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestViewDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], RequestViewDto.prototype, "outreachPaused", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "cancelReason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "contactPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "altContactPhone", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "specialInstructions", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "hospitalFacilityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "collectionFacilityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: FacilityNameDto }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "hospital", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: FacilityNameDto }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "collectionDestination", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, enum: ['Self-reported', 'Service-confirmed'] }),
    __metadata("design:type", Object)
], RequestViewDto.prototype, "outcomeConfidence", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], RequestViewDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], RequestViewDto.prototype, "updatedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], RequestViewDto.prototype, "version", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: RequestMilestonesDto }),
    __metadata("design:type", RequestMilestonesDto)
], RequestViewDto.prototype, "milestones", void 0);
class RequestProgressDto {
    contacted;
    responded;
    willing;
    searchWave;
}
exports.RequestProgressDto = RequestProgressDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], RequestProgressDto.prototype, "contacted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], RequestProgressDto.prototype, "responded", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], RequestProgressDto.prototype, "willing", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], RequestProgressDto.prototype, "searchWave", void 0);
class TimelineEntryDto {
    at;
    from;
    to;
    actorRole;
    reasonCode;
    reason;
    missingItems;
}
exports.TimelineEntryDto = TimelineEntryDto;
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], TimelineEntryDto.prototype, "at", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], TimelineEntryDto.prototype, "from", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], TimelineEntryDto.prototype, "to", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Role only; staff are never named' }),
    __metadata("design:type", String)
], TimelineEntryDto.prototype, "actorRole", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], TimelineEntryDto.prototype, "reasonCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], TimelineEntryDto.prototype, "reason", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    __metadata("design:type", Array)
], TimelineEntryDto.prototype, "missingItems", void 0);
class RequestChangeDto {
    id;
    changeType;
    isMaterial;
    status;
    proposedValues;
    previousValues;
    createdAt;
}
exports.RequestChangeDto = RequestChangeDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestChangeDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestChangeDto.prototype, "changeType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], RequestChangeDto.prototype, "isMaterial", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Auto-applied'] }),
    __metadata("design:type", String)
], RequestChangeDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: 'object', additionalProperties: true }),
    __metadata("design:type", Object)
], RequestChangeDto.prototype, "proposedValues", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: 'object', additionalProperties: true }),
    __metadata("design:type", Object)
], RequestChangeDto.prototype, "previousValues", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], RequestChangeDto.prototype, "createdAt", void 0);
class RequestChangeResultDto {
    request;
    changes;
}
exports.RequestChangeResultDto = RequestChangeResultDto;
__decorate([
    (0, swagger_1.ApiProperty)({ type: RequestViewDto }),
    __metadata("design:type", RequestViewDto)
], RequestChangeResultDto.prototype, "request", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [RequestChangeDto] }),
    __metadata("design:type", Array)
], RequestChangeResultDto.prototype, "changes", void 0);
class PatientListItemDto {
    id;
    displayName;
    relationship;
    hospitalPatientRef;
}
exports.PatientListItemDto = PatientListItemDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PatientListItemDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PatientListItemDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PatientListItemDto.prototype, "relationship", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], PatientListItemDto.prototype, "hospitalPatientRef", void 0);
//# sourceMappingURL=request-view.dto.js.map