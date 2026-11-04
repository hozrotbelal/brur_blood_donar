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
exports.WithdrawInvitationDto = exports.RespondDto = exports.ApproveWaveDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class ApproveWaveDto {
    removeCandidateIds;
    note;
}
exports.ApproveWaveDto = ApproveWaveDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Candidates to drop from the proposed batch' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsArray)(),
    (0, class_validator_1.ArrayMaxSize)(50),
    (0, class_validator_1.IsUUID)('all', { each: true }),
    __metadata("design:type", Array)
], ApproveWaveDto.prototype, "removeCandidateIds", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Required once the wave number passes the maximum' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(500),
    __metadata("design:type", String)
], ApproveWaveDto.prototype, "note", void 0);
class RespondDto {
    response;
    laterAvailableAt;
    clientMutationId;
}
exports.RespondDto = RespondDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Available', 'Later', 'Unavailable'] }),
    (0, class_validator_1.IsIn)(['Available', 'Later', 'Unavailable']),
    __metadata("design:type", String)
], RespondDto.prototype, "response", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'When the donor will be able to answer; needed for Later' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], RespondDto.prototype, "laterAvailableAt", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], RespondDto.prototype, "clientMutationId", void 0);
class WithdrawInvitationDto {
    reason;
}
exports.WithdrawInvitationDto = WithdrawInvitationDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['SCHEDULE_CONFLICT', 'TRAVEL_PROBLEM', 'ADVISED_NOT_TO_DONATE', 'PERSONAL', 'OTHER'] }),
    (0, class_validator_1.IsIn)(['SCHEDULE_CONFLICT', 'TRAVEL_PROBLEM', 'ADVISED_NOT_TO_DONATE', 'PERSONAL', 'OTHER']),
    __metadata("design:type", String)
], WithdrawInvitationDto.prototype, "reason", void 0);
//# sourceMappingURL=invitation.dto.js.map