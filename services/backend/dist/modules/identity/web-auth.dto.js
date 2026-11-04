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
exports.WebStaffVerifyDto = exports.WebSignedInDto = exports.WebMfaChallengeDto = exports.WebLoginDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_validator_1 = require("class-validator");
class WebLoginDto {
    phone;
    password;
    role;
}
exports.WebLoginDto = WebLoginDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], WebLoginDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], WebLoginDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['SUP', 'MOD', 'ADM', 'DON', 'PAT'], description: 'Staff roles use the staff portal; DON and PAT are public users (ADR-15 Amendment 1)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['SUP', 'MOD', 'ADM', 'DON', 'PAT']),
    __metadata("design:type", String)
], WebLoginDto.prototype, "role", void 0);
class WebMfaChallengeDto {
    mfaRequired;
    challengeId;
    expiresInSeconds;
}
exports.WebMfaChallengeDto = WebMfaChallengeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: [true] }),
    __metadata("design:type", Boolean)
], WebMfaChallengeDto.prototype, "mfaRequired", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], WebMfaChallengeDto.prototype, "challengeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], WebMfaChallengeDto.prototype, "expiresInSeconds", void 0);
class WebSignedInDto {
    accessToken;
    expiresIn;
    role;
    csrfToken;
}
exports.WebSignedInDto = WebSignedInDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Short-lived access token; keep in memory only' }),
    __metadata("design:type", String)
], WebSignedInDto.prototype, "accessToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], WebSignedInDto.prototype, "expiresIn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['SUP', 'MOD', 'ADM', 'DON', 'PAT'] }),
    __metadata("design:type", String)
], WebSignedInDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Send back in the X-CSRF-Token header on refresh and logout' }),
    __metadata("design:type", String)
], WebSignedInDto.prototype, "csrfToken", void 0);
class WebStaffVerifyDto {
    challengeId;
    code;
    role;
    trustBrowser;
}
exports.WebStaffVerifyDto = WebStaffVerifyDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], WebStaffVerifyDto.prototype, "challengeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123456' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 6),
    __metadata("design:type", String)
], WebStaffVerifyDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['SUP', 'MOD', 'ADM'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['SUP', 'MOD', 'ADM']),
    __metadata("design:type", String)
], WebStaffVerifyDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Skip the SMS code on this browser until the trusted-browser period ends' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], WebStaffVerifyDto.prototype, "trustBrowser", void 0);
//# sourceMappingURL=web-auth.dto.js.map