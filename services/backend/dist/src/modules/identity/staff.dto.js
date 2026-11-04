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
exports.ChangeAssignmentDto = exports.AcceptStaffInvitationDto = exports.InviteStaffDto = void 0;
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
//# sourceMappingURL=staff.dto.js.map