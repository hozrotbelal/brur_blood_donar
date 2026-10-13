import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const CONSENT_TYPES = [
  'URGENT_INVITATIONS', 'ROUTINE_INVITATIONS', 'CAMPAIGNS', 'REMINDERS', 'LOCATION_USE', 'CHANNEL_PUSH',
  'CHANNEL_SMS', 'CHANNEL_INAPP', 'COMMUNITY_VISIBILITY', 'TERMS', 'PRIVACY',
] as const;
export const NOTIFICATION_CATEGORIES = ['INVITATIONS', 'REMINDERS', 'REQUEST_UPDATES', 'SUPPORT', 'CAMPAIGNS', 'COMMUNITY', 'SYSTEM'] as const;
export const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SaveDonorProfileDto {
  @ApiProperty({ enum: BLOOD_GROUPS }) @IsIn(BLOOD_GROUPS) bloodGroup!: (typeof BLOOD_GROUPS)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() areaId?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) travelRadiusKm?: number;
  @ApiPropertyOptional({ description: 'Self-reported; cannot be in the future' }) @IsOptional() @IsDateString() lastDonationDate?: string;
}

export class SaveAvailabilityDto {
  @ApiProperty() @IsBoolean() routineAvailable!: boolean;
  @ApiProperty() @IsBoolean() urgentAvailable!: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsDateString() pausedUntil?: string | null;
  @ApiProperty({ example: '08:00' }) @Matches(TIME) contactStart!: string;
  @ApiProperty({ example: '21:00' }) @Matches(TIME) contactEnd!: string;
  @ApiProperty({ enum: DAYS, isArray: true }) @IsIn(DAYS, { each: true }) contactDays!: (typeof DAYS)[number][];
}

export class ProposeLocationDto {
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(-90) @Max(90) latitude!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(-180) @Max(180) longitude!: number;
  @ApiProperty({ enum: ['DEVICE_SHARED', 'MANUAL_PICK'] }) @IsIn(['DEVICE_SHARED', 'MANUAL_PICK']) source!: 'DEVICE_SHARED' | 'MANUAL_PICK';
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000) accuracyM?: number;
  @ApiPropertyOptional({ minimum: 500, maximum: 5000, default: 1000 }) @IsOptional() @Type(() => Number) @IsInt() @Min(500) @Max(5000) gridSizeM?: number;
}

export class SaveConsentDto {
  @ApiProperty() @IsBoolean() granted!: boolean;
  @ApiProperty() @IsString() @MaxLength(40) policyVersion!: string;
  @ApiProperty({ enum: ['bn', 'en'] }) @IsIn(['bn', 'en']) language!: 'bn' | 'en';
  @ApiPropertyOptional({ enum: ['ONBOARDING', 'PROFILE_SETTINGS', 'INVITATION_PROMPT'] })
  @IsOptional() @IsIn(['ONBOARDING', 'PROFILE_SETTINGS', 'INVITATION_PROMPT']) channel?: 'ONBOARDING' | 'PROFILE_SETTINGS' | 'INVITATION_PROMPT';
}

export class SaveNotificationPreferenceDto {
  @ApiProperty() @IsBoolean() pushEnabled!: boolean;
  @ApiProperty() @IsBoolean() smsEnabled!: boolean;
  @ApiProperty() @IsBoolean() inappEnabled!: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(TIME) quietStart?: string | null;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Matches(TIME) quietEnd?: string | null;
}
