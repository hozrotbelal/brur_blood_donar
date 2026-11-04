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
exports.GrantDecisionResultDto = exports.GrantDecisionDto = exports.AccessReviewQueryDto = exports.AccessReviewDto = exports.AccessReviewMemberDto = exports.AccessReviewGrantDto = exports.PermissionSetViewDto = exports.PermissionItemDto = exports.AssignmentChangedDto = exports.DeviceResetDto = exports.StaffDeactivatedDto = exports.OpenCaseRefDto = exports.StaffReasonDto = exports.StaffMemberDto = exports.StaffInvitationCreatedDto = exports.StaffInvitationDto = exports.ChangeAssignmentDto = exports.AcceptStaffInvitationDto = exports.InviteStaffDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class InviteStaffDto {
    phone;
    roleCode;
    tierCode;
    areaIds;
}
exports.InviteStaffDto = InviteStaffDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '01712345678' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], InviteStaffDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['SUP', 'MOD', 'ADM'] }),
    (0, class_validator_1.IsIn)(['SUP', 'MOD', 'ADM']),
    __metadata("design:type", String)
], InviteStaffDto.prototype, "roleCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: 'TIER_SUPPORT_AGENT' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], InviteStaffDto.prototype, "tierCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.IsUUID)('all', { each: true }),
    __metadata("design:type", Array)
], InviteStaffDto.prototype, "areaIds", void 0);
class AcceptStaffInvitationDto {
    token;
    password;
    language;
}
exports.AcceptStaffInvitationDto = AcceptStaffInvitationDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(20, 200),
    __metadata("design:type", String)
], AcceptStaffInvitationDto.prototype, "token", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], AcceptStaffInvitationDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['bn', 'en'] }),
    (0, class_validator_1.IsIn)(['bn', 'en']),
    __metadata("design:type", String)
], AcceptStaffInvitationDto.prototype, "language", void 0);
class ChangeAssignmentDto {
    tierCode;
    areaIds;
    reason;
}
exports.ChangeAssignmentDto = ChangeAssignmentDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(60),
    __metadata("design:type", String)
], ChangeAssignmentDto.prototype, "tierCode", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: [String] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.IsUUID)('all', { each: true }),
    __metadata("design:type", Array)
], ChangeAssignmentDto.prototype, "areaIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ChangeAssignmentDto.prototype, "reason", void 0);
class StaffInvitationDto {
    id;
    phoneLast4;
    roleCode;
    tierCode;
    areaIds;
    status;
    expiresAt;
    createdAt;
    acceptedAt;
}
exports.StaffInvitationDto = StaffInvitationDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffInvitationDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last four digits of the invited number' }),
    __metadata("design:type", String)
], StaffInvitationDto.prototype, "phoneLast4", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffInvitationDto.prototype, "roleCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], StaffInvitationDto.prototype, "tierCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], StaffInvitationDto.prototype, "areaIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffInvitationDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", String)
], StaffInvitationDto.prototype, "expiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ format: 'date-time' }),
    __metadata("design:type", String)
], StaffInvitationDto.prototype, "createdAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], StaffInvitationDto.prototype, "acceptedAt", void 0);
class StaffInvitationCreatedDto {
    id;
    expiresInDays;
}
exports.StaffInvitationCreatedDto = StaffInvitationCreatedDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffInvitationCreatedDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], StaffInvitationCreatedDto.prototype, "expiresInDays", void 0);
class StaffMemberDto {
    userId;
    displayName;
    phoneLast4;
    roleCode;
    tierCode;
    areaIds;
    status;
    lastLoginAt;
}
exports.StaffMemberDto = StaffMemberDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffMemberDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], StaffMemberDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Last four digits of the phone number' }),
    __metadata("design:type", String)
], StaffMemberDto.prototype, "phoneLast4", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, enum: ['SUP', 'MOD', 'ADM'] }),
    __metadata("design:type", Object)
], StaffMemberDto.prototype, "roleCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], StaffMemberDto.prototype, "tierCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], StaffMemberDto.prototype, "areaIds", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Active', 'Deactivated', 'Locked', 'Suspended'] }),
    __metadata("design:type", String)
], StaffMemberDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], StaffMemberDto.prototype, "lastLoginAt", void 0);
class StaffReasonDto {
    reason;
}
exports.StaffReasonDto = StaffReasonDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], StaffReasonDto.prototype, "reason", void 0);
class OpenCaseRefDto {
    id;
    caseNo;
    requestId;
}
exports.OpenCaseRefDto = OpenCaseRefDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OpenCaseRefDto.prototype, "id", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OpenCaseRefDto.prototype, "caseNo", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OpenCaseRefDto.prototype, "requestId", void 0);
class StaffDeactivatedDto {
    userId;
    status;
    openCases;
}
exports.StaffDeactivatedDto = StaffDeactivatedDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], StaffDeactivatedDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Deactivated'] }),
    __metadata("design:type", String)
], StaffDeactivatedDto.prototype, "status", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [OpenCaseRefDto], description: 'Open cases the person owned; reassign them' }),
    __metadata("design:type", Array)
], StaffDeactivatedDto.prototype, "openCases", void 0);
class DeviceResetDto {
    userId;
    devicesRevoked;
}
exports.DeviceResetDto = DeviceResetDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], DeviceResetDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], DeviceResetDto.prototype, "devicesRevoked", void 0);
class AssignmentChangedDto {
    userId;
    tierCode;
    areaIds;
}
exports.AssignmentChangedDto = AssignmentChangedDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AssignmentChangedDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AssignmentChangedDto.prototype, "tierCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], AssignmentChangedDto.prototype, "areaIds", void 0);
class PermissionItemDto {
    key;
    scope;
    descriptionEn;
    descriptionBn;
    sensitive;
    requiresStepUp;
}
exports.PermissionItemDto = PermissionItemDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PermissionItemDto.prototype, "key", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Own', 'Assigned', 'Area', 'All'] }),
    __metadata("design:type", String)
], PermissionItemDto.prototype, "scope", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PermissionItemDto.prototype, "descriptionEn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PermissionItemDto.prototype, "descriptionBn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], PermissionItemDto.prototype, "sensitive", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], PermissionItemDto.prototype, "requiresStepUp", void 0);
class PermissionSetViewDto {
    code;
    nameEn;
    nameBn;
    roleCode;
    kind;
    tierRank;
    items;
}
exports.PermissionSetViewDto = PermissionSetViewDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PermissionSetViewDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PermissionSetViewDto.prototype, "nameEn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], PermissionSetViewDto.prototype, "nameBn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['DON', 'PAT', 'SUP', 'MOD', 'ADM'] }),
    __metadata("design:type", String)
], PermissionSetViewDto.prototype, "roleCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['BASE', 'TIER', 'SCOPE', 'CUSTOM'] }),
    __metadata("design:type", String)
], PermissionSetViewDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: Number }),
    __metadata("design:type", Object)
], PermissionSetViewDto.prototype, "tierRank", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [PermissionItemDto] }),
    __metadata("design:type", Array)
], PermissionSetViewDto.prototype, "items", void 0);
class AccessReviewGrantDto {
    grantId;
    setCode;
    setNameEn;
    setNameBn;
    kind;
    expiresAt;
    sensitiveKeys;
    decision;
    decidedAt;
}
exports.AccessReviewGrantDto = AccessReviewGrantDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AccessReviewGrantDto.prototype, "grantId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AccessReviewGrantDto.prototype, "setCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AccessReviewGrantDto.prototype, "setNameEn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AccessReviewGrantDto.prototype, "setNameBn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['SCOPE', 'CUSTOM'] }),
    __metadata("design:type", String)
], AccessReviewGrantDto.prototype, "kind", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], AccessReviewGrantDto.prototype, "expiresAt", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], AccessReviewGrantDto.prototype, "sensitiveKeys", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, enum: ['KEEP', 'REVOKE'] }),
    __metadata("design:type", Object)
], AccessReviewGrantDto.prototype, "decision", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String, format: 'date-time' }),
    __metadata("design:type", Object)
], AccessReviewGrantDto.prototype, "decidedAt", void 0);
class AccessReviewMemberDto {
    userId;
    displayName;
    roleCode;
    tierCode;
    reveals;
    searches;
    grants;
}
exports.AccessReviewMemberDto = AccessReviewMemberDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], AccessReviewMemberDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], AccessReviewMemberDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], AccessReviewMemberDto.prototype, "roleCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], AccessReviewMemberDto.prototype, "tierCode", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], AccessReviewMemberDto.prototype, "reveals", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], AccessReviewMemberDto.prototype, "searches", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [AccessReviewGrantDto] }),
    __metadata("design:type", Array)
], AccessReviewMemberDto.prototype, "grants", void 0);
class AccessReviewDto {
    month;
    members;
}
exports.AccessReviewDto = AccessReviewDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '2026-11' }),
    __metadata("design:type", String)
], AccessReviewDto.prototype, "month", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [AccessReviewMemberDto] }),
    __metadata("design:type", Array)
], AccessReviewDto.prototype, "members", void 0);
class AccessReviewQueryDto {
    month;
}
exports.AccessReviewQueryDto = AccessReviewQueryDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '2026-11', description: 'Month in Asia/Dhaka time; defaults to the current month' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(/^\d{4}-(0[1-9]|1[0-2])$/),
    __metadata("design:type", String)
], AccessReviewQueryDto.prototype, "month", void 0);
class GrantDecisionDto {
    decision;
    reason;
}
exports.GrantDecisionDto = GrantDecisionDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['KEEP', 'REVOKE'] }),
    (0, class_validator_1.IsIn)(['KEEP', 'REVOKE']),
    __metadata("design:type", String)
], GrantDecisionDto.prototype, "decision", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MinLength)(5),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], GrantDecisionDto.prototype, "reason", void 0);
class GrantDecisionResultDto {
    grantId;
    decision;
}
exports.GrantDecisionResultDto = GrantDecisionResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], GrantDecisionResultDto.prototype, "grantId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['KEEP', 'REVOKE'] }),
    __metadata("design:type", String)
], GrantDecisionResultDto.prototype, "decision", void 0);
//# sourceMappingURL=staff.dto.js.map