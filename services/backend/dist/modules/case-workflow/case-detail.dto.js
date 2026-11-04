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
exports.DisputeResolutionDto = exports.DisputeResultDto = exports.RequestStatusResultDto = exports.FulfilmentResultDto = exports.OutcomeRecordedDto = exports.StaffAppointmentDto = exports.CreatedIdDto = exports.CaseStateDto = exports.CaseDetailDto = exports.CaseOutcomeDto = exports.CaseContactDto = exports.CaseNoteViewDto = exports.CaseTaskDto = exports.CaseAppointmentDto = exports.CaseDonorDto = void 0;
const swagger_1 = require("@nestjs/swagger");
class CaseDonorDto {
    id;
    donorCode;
    status;
    joinedAt;
}
exports.CaseDonorDto = CaseDonorDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseDonorDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseDonorDto.prototype, "donorCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseDonorDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], CaseDonorDto.prototype, "joinedAt", void 0);
class CaseAppointmentDto {
    id;
    caseDonorId;
    facilityId;
    facility;
    scheduledStart;
    status;
    previousAppointmentId;
}
exports.CaseAppointmentDto = CaseAppointmentDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseAppointmentDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseAppointmentDto.prototype, "caseDonorId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseAppointmentDto.prototype, "facilityId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseAppointmentDto.prototype, "facility", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], CaseAppointmentDto.prototype, "scheduledStart", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseAppointmentDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseAppointmentDto.prototype, "previousAppointmentId", void 0);
class CaseTaskDto {
    id;
    taskType;
    status;
    dueAt;
    assigneeUserId;
}
exports.CaseTaskDto = CaseTaskDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseTaskDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseTaskDto.prototype, "taskType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseTaskDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], CaseTaskDto.prototype, "dueAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseTaskDto.prototype, "assigneeUserId", void 0);
class CaseNoteViewDto {
    id;
    noteType;
    body;
    authorUserId;
    createdAt;
}
exports.CaseNoteViewDto = CaseNoteViewDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseNoteViewDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseNoteViewDto.prototype, "noteType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseNoteViewDto.prototype, "body", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseNoteViewDto.prototype, "authorUserId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], CaseNoteViewDto.prototype, "createdAt", void 0);
class CaseContactDto {
    id;
    targetParty;
    channel;
    result;
    attemptedBy;
    attemptedAt;
}
exports.CaseContactDto = CaseContactDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseContactDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseContactDto.prototype, "targetParty", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseContactDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseContactDto.prototype, "result", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseContactDto.prototype, "attemptedBy", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], CaseContactDto.prototype, "attemptedAt", void 0);
class CaseOutcomeDto {
    id;
    outcomeType;
    sourceType;
    confidence;
    units;
    reportedByName;
    reportedByRole;
    channel;
    reportedAt;
    disputed;
    supersedesId;
}
exports.CaseOutcomeDto = CaseOutcomeDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseOutcomeDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseOutcomeDto.prototype, "outcomeType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseOutcomeDto.prototype, "sourceType", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Self-reported', 'Service-confirmed'] }),
    __metadata("design:type", String)
], CaseOutcomeDto.prototype, "confidence", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: Number }),
    __metadata("design:type", Object)
], CaseOutcomeDto.prototype, "units", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseOutcomeDto.prototype, "reportedByName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseOutcomeDto.prototype, "reportedByRole", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseOutcomeDto.prototype, "channel", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], CaseOutcomeDto.prototype, "reportedAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CaseOutcomeDto.prototype, "disputed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseOutcomeDto.prototype, "supersedesId", void 0);
class CaseDetailDto {
    id;
    caseNo;
    requestId;
    requestReference;
    status;
    priority;
    ownerUserId;
    disputed;
    donors;
    appointments;
    tasks;
    notes;
    contacts;
    outcomes;
}
exports.CaseDetailDto = CaseDetailDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseDetailDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseDetailDto.prototype, "caseNo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseDetailDto.prototype, "requestId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseDetailDto.prototype, "requestReference", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseDetailDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseDetailDto.prototype, "priority", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], CaseDetailDto.prototype, "ownerUserId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], CaseDetailDto.prototype, "disputed", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CaseDonorDto] }),
    __metadata("design:type", Array)
], CaseDetailDto.prototype, "donors", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CaseAppointmentDto] }),
    __metadata("design:type", Array)
], CaseDetailDto.prototype, "appointments", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CaseTaskDto] }),
    __metadata("design:type", Array)
], CaseDetailDto.prototype, "tasks", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CaseNoteViewDto] }),
    __metadata("design:type", Array)
], CaseDetailDto.prototype, "notes", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CaseContactDto] }),
    __metadata("design:type", Array)
], CaseDetailDto.prototype, "contacts", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [CaseOutcomeDto] }),
    __metadata("design:type", Array)
], CaseDetailDto.prototype, "outcomes", void 0);
class CaseStateDto {
    id;
    status;
}
exports.CaseStateDto = CaseStateDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseStateDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CaseStateDto.prototype, "status", void 0);
class CreatedIdDto {
    id;
}
exports.CreatedIdDto = CreatedIdDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], CreatedIdDto.prototype, "id", void 0);
class StaffAppointmentDto {
    id;
    caseId;
    status;
    scheduledStart;
    facilityId;
    previousAppointmentId;
}
exports.StaffAppointmentDto = StaffAppointmentDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffAppointmentDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffAppointmentDto.prototype, "caseId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffAppointmentDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", Date)
], StaffAppointmentDto.prototype, "scheduledStart", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffAppointmentDto.prototype, "facilityId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], StaffAppointmentDto.prototype, "previousAppointmentId", void 0);
class OutcomeRecordedDto {
    id;
    confidence;
    caseStatus;
}
exports.OutcomeRecordedDto = OutcomeRecordedDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OutcomeRecordedDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Self-reported', 'Service-confirmed'] }),
    __metadata("design:type", String)
], OutcomeRecordedDto.prototype, "confidence", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OutcomeRecordedDto.prototype, "caseStatus", void 0);
class FulfilmentResultDto {
    requestStatus;
    confirmedUnits;
    requestedUnits;
}
exports.FulfilmentResultDto = FulfilmentResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], FulfilmentResultDto.prototype, "requestStatus", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], FulfilmentResultDto.prototype, "confirmedUnits", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], FulfilmentResultDto.prototype, "requestedUnits", void 0);
class RequestStatusResultDto {
    requestStatus;
}
exports.RequestStatusResultDto = RequestStatusResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], RequestStatusResultDto.prototype, "requestStatus", void 0);
class DisputeResultDto {
    caseId;
    outcomeId;
    disputed;
}
exports.DisputeResultDto = DisputeResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DisputeResultDto.prototype, "caseId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DisputeResultDto.prototype, "outcomeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DisputeResultDto.prototype, "disputed", void 0);
class DisputeResolutionDto {
    caseId;
    outcomeId;
    resolution;
    correctionId;
    disputed;
}
exports.DisputeResolutionDto = DisputeResolutionDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DisputeResolutionDto.prototype, "caseId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DisputeResolutionDto.prototype, "outcomeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['UPHELD', 'CORRECTED'] }),
    __metadata("design:type", String)
], DisputeResolutionDto.prototype, "resolution", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], DisputeResolutionDto.prototype, "correctionId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], DisputeResolutionDto.prototype, "disputed", void 0);
//# sourceMappingURL=case-detail.dto.js.map