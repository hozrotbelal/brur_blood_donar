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
exports.SaveNotificationPreferenceDto = exports.SaveConsentDto = exports.ProposeLocationDto = exports.SaveAvailabilityDto = exports.SaveDonorProfileDto = exports.DAYS = exports.NOTIFICATION_CATEGORIES = exports.CONSENT_TYPES = exports.BLOOD_GROUPS = void 0;
const swagger_1 = require("@nestjs/swagger");
const class_transformer_1 = require("class-transformer");
const class_validator_1 = require("class-validator");
exports.BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
exports.CONSENT_TYPES = [
    'URGENT_INVITATIONS', 'ROUTINE_INVITATIONS', 'CAMPAIGNS', 'REMINDERS', 'LOCATION_USE', 'CHANNEL_PUSH',
    'CHANNEL_SMS', 'CHANNEL_INAPP', 'COMMUNITY_VISIBILITY', 'TERMS', 'PRIVACY',
];
exports.NOTIFICATION_CATEGORIES = ['INVITATIONS', 'REMINDERS', 'REQUEST_UPDATES', 'SUPPORT', 'CAMPAIGNS', 'COMMUNITY', 'SYSTEM'];
exports.DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
class SaveDonorProfileDto {
    bloodGroup;
    areaId;
    travelRadiusKm;
    lastDonationDate;
}
exports.SaveDonorProfileDto = SaveDonorProfileDto;
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.BLOOD_GROUPS }),
    (0, class_validator_1.IsIn)(exports.BLOOD_GROUPS),
    __metadata("design:type", Object)
], SaveDonorProfileDto.prototype, "bloodGroup", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsUUID)(),
    __metadata("design:type", String)
], SaveDonorProfileDto.prototype, "areaId", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 1, maximum: 100 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(1),
    (0, class_validator_1.Max)(100),
    __metadata("design:type", Number)
], SaveDonorProfileDto.prototype, "travelRadiusKm", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ description: 'Self-reported; cannot be in the future' }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", String)
], SaveDonorProfileDto.prototype, "lastDonationDate", void 0);
class SaveAvailabilityDto {
    routineAvailable;
    urgentAvailable;
    pausedUntil;
    contactStart;
    contactEnd;
    contactDays;
}
exports.SaveAvailabilityDto = SaveAvailabilityDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveAvailabilityDto.prototype, "routineAvailable", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveAvailabilityDto.prototype, "urgentAvailable", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsDateString)(),
    __metadata("design:type", Object)
], SaveAvailabilityDto.prototype, "pausedUntil", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '08:00' }),
    (0, class_validator_1.Matches)(TIME),
    __metadata("design:type", String)
], SaveAvailabilityDto.prototype, "contactStart", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ example: '21:00' }),
    (0, class_validator_1.Matches)(TIME),
    __metadata("design:type", String)
], SaveAvailabilityDto.prototype, "contactEnd", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: exports.DAYS, isArray: true }),
    (0, class_validator_1.IsIn)(exports.DAYS, { each: true }),
    __metadata("design:type", Array)
], SaveAvailabilityDto.prototype, "contactDays", void 0);
class ProposeLocationDto {
    latitude;
    longitude;
    source;
    accuracyM;
    gridSizeM;
}
exports.ProposeLocationDto = ProposeLocationDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(-90),
    (0, class_validator_1.Max)(90),
    __metadata("design:type", Number)
], ProposeLocationDto.prototype, "latitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(-180),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], ProposeLocationDto.prototype, "longitude", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['DEVICE_SHARED', 'MANUAL_PICK'] }),
    (0, class_validator_1.IsIn)(['DEVICE_SHARED', 'MANUAL_PICK']),
    __metadata("design:type", String)
], ProposeLocationDto.prototype, "source", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)(),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100000),
    __metadata("design:type", Number)
], ProposeLocationDto.prototype, "accuracyM", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ minimum: 500, maximum: 5000, default: 1000 }),
    (0, class_validator_1.IsOptional)(),
    (0, class_transformer_1.Type)(() => Number),
    (0, class_validator_1.IsInt)(),
    (0, class_validator_1.Min)(500),
    (0, class_validator_1.Max)(5000),
    __metadata("design:type", Number)
], ProposeLocationDto.prototype, "gridSizeM", void 0);
class SaveConsentDto {
    granted;
    policyVersion;
    language;
    channel;
}
exports.SaveConsentDto = SaveConsentDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveConsentDto.prototype, "granted", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(40),
    __metadata("design:type", String)
], SaveConsentDto.prototype, "policyVersion", void 0);
__decorate([
    (0, swagger_1.ApiProperty)({ enum: ['bn', 'en'] }),
    (0, class_validator_1.IsIn)(['bn', 'en']),
    __metadata("design:type", String)
], SaveConsentDto.prototype, "language", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ enum: ['ONBOARDING', 'PROFILE_SETTINGS', 'INVITATION_PROMPT'] }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.IsIn)(['ONBOARDING', 'PROFILE_SETTINGS', 'INVITATION_PROMPT']),
    __metadata("design:type", String)
], SaveConsentDto.prototype, "channel", void 0);
class SaveNotificationPreferenceDto {
    pushEnabled;
    smsEnabled;
    inappEnabled;
    quietStart;
    quietEnd;
}
exports.SaveNotificationPreferenceDto = SaveNotificationPreferenceDto;
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveNotificationPreferenceDto.prototype, "pushEnabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveNotificationPreferenceDto.prototype, "smsEnabled", void 0);
__decorate([
    (0, swagger_1.ApiProperty)(),
    (0, class_validator_1.IsBoolean)(),
    __metadata("design:type", Boolean)
], SaveNotificationPreferenceDto.prototype, "inappEnabled", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(TIME),
    __metadata("design:type", Object)
], SaveNotificationPreferenceDto.prototype, "quietStart", void 0);
__decorate([
    (0, swagger_1.ApiPropertyOptional)({ nullable: true }),
    (0, class_validator_1.IsOptional)(),
    (0, class_validator_1.Matches)(TIME),
    __metadata("design:type", Object)
], SaveNotificationPreferenceDto.prototype, "quietEnd", void 0);
//# sourceMappingURL=donor.dto.js.map