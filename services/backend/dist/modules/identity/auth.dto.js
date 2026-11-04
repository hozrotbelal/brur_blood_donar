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
exports.MeDto = exports.MeGrantDto = exports.StepUpResultDto = exports.ResetOutcomeDto = exports.ResetTokenDto = exports.SetupTokenDto = exports.OtpChallengeDto = exports.MfaChallengeDto = exports.TokenPairDto = exports.AcceptedDto = exports.StepUpDto = exports.ChangePasswordDto = exports.ResetPasswordDto = exports.StaffMfaDto = exports.RefreshDto = exports.LoginDto = exports.SetPasswordDto = exports.VerifyOtpDto = exports.PhoneDto = exports.RegisterDto = exports.DeviceProofDto = exports.DeviceDto = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
class DeviceDto {
    installId;
    platform;
    model;
    osVersion;
    appVersion;
    isRooted;
    publicKey;
}
exports.DeviceDto = DeviceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(8, 128),
    __metadata("design:type", String)
], DeviceDto.prototype, "installId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['android', 'ios'] }),
    (0, class_validator_1.IsIn)(['android', 'ios']),
    __metadata("design:type", String)
], DeviceDto.prototype, "platform", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    __metadata("design:type", String)
], DeviceDto.prototype, "model", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], DeviceDto.prototype, "osVersion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(50),
    __metadata("design:type", String)
], DeviceDto.prototype, "appVersion", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], DeviceDto.prototype, "isRooted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'P-256 public key (SPKI PEM) generated on the device; refresh and step-up proofs are signed with its private key' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(600),
    __metadata("design:type", String)
], DeviceDto.prototype, "publicKey", void 0);
class DeviceProofDto {
    timestamp;
    signature;
}
exports.DeviceProofDto = DeviceProofDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Unix time in milliseconds when the proof was signed; must be within 5 minutes of server time' }),
    (0, class_validator_1.IsInt)(),
    __metadata("design:type", Number)
], DeviceProofDto.prototype, "timestamp", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'ES256 signature (base64url, IEEE P1363) over bbda:<kind>:<subject>:<timestamp>' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(200),
    __metadata("design:type", String)
], DeviceProofDto.prototype, "signature", void 0);
class RegisterDto {
    phone;
    role;
    language;
}
exports.RegisterDto = RegisterDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '01712345678' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], RegisterDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['DON', 'PAT'] }),
    (0, class_validator_1.IsIn)(['DON', 'PAT']),
    __metadata("design:type", String)
], RegisterDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['bn', 'en'] }),
    (0, class_validator_1.IsIn)(['bn', 'en']),
    __metadata("design:type", String)
], RegisterDto.prototype, "language", void 0);
class PhoneDto {
    phone;
}
exports.PhoneDto = PhoneDto;
__decorate([
    (0, swagger_1.ApiProperty)({ example: '01712345678' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], PhoneDto.prototype, "phone", void 0);
class VerifyOtpDto {
    challengeId;
    code;
    role;
    language;
    device;
}
exports.VerifyOtpDto = VerifyOtpDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "challengeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123456' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 6),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['DON', 'PAT'], description: 'Registration and SMS-code sign-in' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['DON', 'PAT']),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['bn', 'en'], description: 'Registration only' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['bn', 'en']),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DeviceDto, description: 'SMS-code sign-in only' }),
    (0, class_validator_1.ValidateIf)((o) => o.device !== undefined),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeviceDto),
    __metadata("design:type", DeviceDto)
], VerifyOtpDto.prototype, "device", void 0);
class SetPasswordDto {
    setupToken;
    password;
    device;
}
exports.SetPasswordDto = SetPasswordDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(2000),
    __metadata("design:type", String)
], SetPasswordDto.prototype, "setupToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], SetPasswordDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DeviceDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeviceDto),
    __metadata("design:type", DeviceDto)
], SetPasswordDto.prototype, "device", void 0);
class LoginDto {
    phone;
    password;
    role;
    device;
}
exports.LoginDto = LoginDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(20),
    __metadata("design:type", String)
], LoginDto.prototype, "phone", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], LoginDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['DON', 'PAT'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['DON', 'PAT']),
    __metadata("design:type", String)
], LoginDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DeviceDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeviceDto),
    __metadata("design:type", DeviceDto)
], LoginDto.prototype, "device", void 0);
class RefreshDto {
    refreshToken;
    proof;
}
exports.RefreshDto = RefreshDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], RefreshDto.prototype, "refreshToken", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DeviceProofDto, description: 'Required for devices registered with a public key; subject is the refresh token' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeviceProofDto),
    __metadata("design:type", DeviceProofDto)
], RefreshDto.prototype, "proof", void 0);
class StaffMfaDto {
    challengeId;
    code;
    role;
    device;
}
exports.StaffMfaDto = StaffMfaDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], StaffMfaDto.prototype, "challengeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '123456' }),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 6),
    __metadata("design:type", String)
], StaffMfaDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['SUP', 'MOD', 'ADM'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['SUP', 'MOD', 'ADM']),
    __metadata("design:type", String)
], StaffMfaDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DeviceDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeviceDto),
    __metadata("design:type", DeviceDto)
], StaffMfaDto.prototype, "device", void 0);
class ResetPasswordDto {
    resetToken;
    password;
    device;
}
exports.ResetPasswordDto = ResetPasswordDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "resetToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], ResetPasswordDto.prototype, "password", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: DeviceDto }),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeviceDto),
    __metadata("design:type", DeviceDto)
], ResetPasswordDto.prototype, "device", void 0);
class ChangePasswordDto {
    currentPassword;
    newPassword;
    signOutOtherDevices;
}
exports.ChangePasswordDto = ChangePasswordDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], ChangePasswordDto.prototype, "currentPassword", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], ChangePasswordDto.prototype, "newPassword", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ default: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], ChangePasswordDto.prototype, "signOutOtherDevices", void 0);
class StepUpDto {
    challengeId;
    code;
    proof;
}
exports.StepUpDto = StepUpDto;
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'SMS code step-up (web, or mobile fallback)' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], StepUpDto.prototype, "challengeId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ example: '123456' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.Length)(6, 6),
    __metadata("design:type", String)
], StepUpDto.prototype, "code", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: DeviceProofDto, description: 'Device-key step-up after biometric or PIN unlock; subject is the session id' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.ValidateNested)(),
    (0, class_transformer_1.Type)(() => DeviceProofDto),
    __metadata("design:type", DeviceProofDto)
], StepUpDto.prototype, "proof", void 0);
class AcceptedDto {
    accepted;
}
exports.AcceptedDto = AcceptedDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: [true] }),
    __metadata("design:type", Boolean)
], AcceptedDto.prototype, "accepted", void 0);
class TokenPairDto {
    accessToken;
    refreshToken;
    expiresIn;
    role;
}
exports.TokenPairDto = TokenPairDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], TokenPairDto.prototype, "accessToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], TokenPairDto.prototype, "refreshToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], TokenPairDto.prototype, "expiresIn", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['DON', 'PAT', 'SUP', 'MOD', 'ADM'] }),
    __metadata("design:type", String)
], TokenPairDto.prototype, "role", void 0);
class MfaChallengeDto {
    mfaRequired;
    challengeId;
    expiresInSeconds;
}
exports.MfaChallengeDto = MfaChallengeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: [true] }),
    __metadata("design:type", Boolean)
], MfaChallengeDto.prototype, "mfaRequired", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MfaChallengeDto.prototype, "challengeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], MfaChallengeDto.prototype, "expiresInSeconds", void 0);
class OtpChallengeDto {
    challengeId;
    expiresInSeconds;
}
exports.OtpChallengeDto = OtpChallengeDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], OtpChallengeDto.prototype, "challengeId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], OtpChallengeDto.prototype, "expiresInSeconds", void 0);
class SetupTokenDto {
    setupToken;
}
exports.SetupTokenDto = SetupTokenDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], SetupTokenDto.prototype, "setupToken", void 0);
class ResetTokenDto {
    resetToken;
    expiresInSeconds;
}
exports.ResetTokenDto = ResetTokenDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], ResetTokenDto.prototype, "resetToken", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Number)
], ResetTokenDto.prototype, "expiresInSeconds", void 0);
class ResetOutcomeDto {
    signedIn;
    tokens;
}
exports.ResetOutcomeDto = ResetOutcomeDto;
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'False for staff, who must sign in again with the 2-step flow' }),
    __metadata("design:type", Boolean)
], ResetOutcomeDto.prototype, "signedIn", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ type: TokenPairDto }),
    __metadata("design:type", TokenPairDto)
], ResetOutcomeDto.prototype, "tokens", void 0);
class StepUpResultDto {
    stepUpValidUntil;
}
exports.StepUpResultDto = StepUpResultDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Date)
], StepUpResultDto.prototype, "stepUpValidUntil", void 0);
class MeGrantDto {
    key;
    scope;
    requiresStepUp;
}
exports.MeGrantDto = MeGrantDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MeGrantDto.prototype, "key", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['Own', 'Assigned', 'Area', 'All'] }),
    __metadata("design:type", String)
], MeGrantDto.prototype, "scope", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", Boolean)
], MeGrantDto.prototype, "requiresStepUp", void 0);
class MeDto {
    userId;
    role;
    displayName;
    roles;
    stepUpValidUntil;
    permissions;
}
exports.MeDto = MeDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    __metadata("design:type", String)
], MeDto.prototype, "userId", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['DON', 'PAT', 'SUP', 'MOD', 'ADM'] }),
    __metadata("design:type", String)
], MeDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true, type: String }),
    __metadata("design:type", Object)
], MeDto.prototype, "displayName", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [String] }),
    __metadata("design:type", Array)
], MeDto.prototype, "roles", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    __metadata("design:type", Object)
], MeDto.prototype, "stepUpValidUntil", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ type: [MeGrantDto] }),
    __metadata("design:type", Array)
], MeDto.prototype, "permissions", void 0);
//# sourceMappingURL=auth.dto.js.map