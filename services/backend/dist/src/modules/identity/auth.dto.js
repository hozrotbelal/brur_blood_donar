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
exports.StaffMfaDto = exports.RefreshDto = exports.LoginDto = exports.SetPasswordDto = exports.VerifyOtpDto = exports.RegisterDto = exports.DeviceDto = void 0;
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
class VerifyOtpDto {
    challengeId;
    code;
    role;
    language;
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
    (0, swagger_1.ApiProperty)({ enum: ['DON', 'PAT'] }),
    (0, class_validator_1.IsIn)(['DON', 'PAT']),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "role", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['bn', 'en'] }),
    (0, class_validator_1.IsIn)(['bn', 'en']),
    __metadata("design:type", String)
], VerifyOtpDto.prototype, "language", void 0);
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
}
exports.RefreshDto = RefreshDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(256),
    __metadata("design:type", String)
], RefreshDto.prototype, "refreshToken", void 0);
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
//# sourceMappingURL=auth.dto.js.map