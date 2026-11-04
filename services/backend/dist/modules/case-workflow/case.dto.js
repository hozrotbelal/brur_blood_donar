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
exports.ResolveDisputeDto = exports.DisputeOutcomeDto = exports.CloseCaseDto = exports.DeclareUnableDto = exports.MoreDonorsDto = exports.RecordOutcomeDto = exports.WithdrawDto = exports.TimingProblemDto = exports.RescheduleDto = exports.ProposeAppointmentDto = exports.ContactAttemptDto = exports.NoteDto = exports.STAFF_OUTCOME_SOURCES = exports.OUTCOME_TYPES = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.OUTCOME_TYPES = ['DONATION_COMPLETED', 'DONATION_NOT_COMPLETED', 'UNITS_RECEIVED_BY_PATIENT_SERVICE', 'NEED_CHANGED', 'NEED_NO_LONGER_REQUIRED'];
exports.STAFF_OUTCOME_SOURCES = ['COLLECTION_SERVICE_CONFIRMATION', 'HOSPITAL_CONFIRMATION', 'SUPPORT_OBSERVATION'];
class NoteDto {
    body;
    noteType;
}
exports.NoteDto = NoteDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(1),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], NoteDto.prototype, "body", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['GENERAL', 'HANDOVER', 'ESCALATION', 'EXTERNAL_CONTACT'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['GENERAL', 'HANDOVER', 'ESCALATION', 'EXTERNAL_CONTACT']),
    __metadata("design:type", String)
], NoteDto.prototype, "noteType", void 0);
class ContactAttemptDto {
    party;
    channel;
    result;
    caseDonorId;
    facilityId;
    externalPerson;
}
exports.ContactAttemptDto = ContactAttemptDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['DONOR', 'REPRESENTATIVE', 'HOSPITAL', 'COLLECTION_SERVICE', 'OTHER_EXTERNAL'] }),
    (0, class_validator_1.IsIn)(['DONOR', 'REPRESENTATIVE', 'HOSPITAL', 'COLLECTION_SERVICE', 'OTHER_EXTERNAL']),
    __metadata("design:type", String)
], ContactAttemptDto.prototype, "party", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['PHONE_CALL', 'SMS', 'IN_APP_MESSAGE'] }),
    (0, class_validator_1.IsIn)(['PHONE_CALL', 'SMS', 'IN_APP_MESSAGE']),
    __metadata("design:type", String)
], ContactAttemptDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['REACHED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'LEFT_MESSAGE'] }),
    (0, class_validator_1.IsIn)(['REACHED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'LEFT_MESSAGE']),
    __metadata("design:type", String)
], ContactAttemptDto.prototype, "result", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ContactAttemptDto.prototype, "caseDonorId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ContactAttemptDto.prototype, "facilityId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Name and role of the external person, kept as a case note' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], ContactAttemptDto.prototype, "externalPerson", void 0);
class ProposeAppointmentDto {
    caseDonorId;
    facilityId;
    scheduledStart;
}
exports.ProposeAppointmentDto = ProposeAppointmentDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ProposeAppointmentDto.prototype, "caseDonorId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], ProposeAppointmentDto.prototype, "facilityId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], ProposeAppointmentDto.prototype, "scheduledStart", void 0);
class RescheduleDto {
    scheduledStart;
    facilityId;
}
exports.RescheduleDto = RescheduleDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], RescheduleDto.prototype, "scheduledStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], RescheduleDto.prototype, "facilityId", void 0);
class TimingProblemDto {
    note;
}
exports.TimingProblemDto = TimingProblemDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], TimingProblemDto.prototype, "note", void 0);
class WithdrawDto {
    reason;
}
exports.WithdrawDto = WithdrawDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['SCHEDULE_CONFLICT', 'TRAVEL_PROBLEM', 'ADVISED_NOT_TO_DONATE', 'PERSONAL', 'OTHER'] }),
    (0, class_validator_1.IsIn)(['SCHEDULE_CONFLICT', 'TRAVEL_PROBLEM', 'ADVISED_NOT_TO_DONATE', 'PERSONAL', 'OTHER']),
    __metadata("design:type", String)
], WithdrawDto.prototype, "reason", void 0);
class RecordOutcomeDto {
    sourceType;
    outcomeType;
    channel;
    units;
    reportedByName;
    reportedByRole;
    reportedAt;
    caseDonorId;
    reason;
}
exports.RecordOutcomeDto = RecordOutcomeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.STAFF_OUTCOME_SOURCES }),
    (0, class_validator_1.IsIn)(exports.STAFF_OUTCOME_SOURCES),
    __metadata("design:type", Object)
], RecordOutcomeDto.prototype, "sourceType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.OUTCOME_TYPES }),
    (0, class_validator_1.IsIn)(exports.OUTCOME_TYPES),
    __metadata("design:type", Object)
], RecordOutcomeDto.prototype, "outcomeType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['PHONE', 'IN_APP'] }),
    (0, class_validator_1.IsIn)(['PHONE', 'IN_APP']),
    __metadata("design:type", String)
], RecordOutcomeDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 0, maximum: 20 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(20),
    __metadata("design:type", Number)
], RecordOutcomeDto.prototype, "units", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], RecordOutcomeDto.prototype, "reportedByName", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], RecordOutcomeDto.prototype, "reportedByRole", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], RecordOutcomeDto.prototype, "reportedAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], RecordOutcomeDto.prototype, "caseDonorId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Free text without clinical detail' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], RecordOutcomeDto.prototype, "reason", void 0);
class MoreDonorsDto {
    needed;
}
exports.MoreDonorsDto = MoreDonorsDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], MoreDonorsDto.prototype, "needed", void 0);
class DeclareUnableDto {
    reason;
}
exports.DeclareUnableDto = DeclareUnableDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], DeclareUnableDto.prototype, "reason", void 0);
class CloseCaseDto {
    note;
}
exports.CloseCaseDto = CloseCaseDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], CloseCaseDto.prototype, "note", void 0);
class DisputeOutcomeDto {
    reason;
}
exports.DisputeOutcomeDto = DisputeOutcomeDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], DisputeOutcomeDto.prototype, "reason", void 0);
class ResolveDisputeDto {
    resolution;
    note;
    correction;
}
exports.ResolveDisputeDto = ResolveDisputeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['UPHELD', 'CORRECTED'] }),
    (0, class_validator_1.IsIn)(['UPHELD', 'CORRECTED']),
    __metadata("design:type", String)
], ResolveDisputeDto.prototype, "resolution", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(3),
    (0, class_validator_1.MaxLength)(1000),
    __metadata("design:type", String)
], ResolveDisputeDto.prototype, "note", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: RecordOutcomeDto, description: 'Required when the resolution is CORRECTED' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => RecordOutcomeDto),
    __metadata("design:type", RecordOutcomeDto)
], ResolveDisputeDto.prototype, "correction", void 0);
//# sourceMappingURL=case.dto.js.map