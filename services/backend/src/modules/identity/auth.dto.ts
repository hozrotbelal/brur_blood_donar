import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateIf, ValidateNested } from 'class-validator';

export class DeviceDto {
  @ApiProperty() @IsString() @Length(8, 128) installId!: string;
  @ApiProperty({ enum: ['android', 'ios'] }) @IsIn(['android', 'ios']) platform!: 'android' | 'ios';
  @ApiProperty() @IsString() @MaxLength(100) model!: string;
  @ApiProperty() @IsString() @MaxLength(50) osVersion!: string;
  @ApiProperty() @IsString() @MaxLength(50) appVersion!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRooted?: boolean;
  @ApiProperty({ description: 'P-256 public key (SPKI PEM) generated on the device; refresh and step-up proofs are signed with its private key' })
  @IsString() @MaxLength(600) publicKey!: string;
}

export class DeviceProofDto {
  @ApiProperty({ description: 'Unix time in milliseconds when the proof was signed; must be within 5 minutes of server time' }) @IsInt() timestamp!: number;
  @ApiProperty({ description: 'ES256 signature (base64url, IEEE P1363) over bbda:<kind>:<subject>:<timestamp>' }) @IsString() @MaxLength(200) signature!: string;
}

export class RegisterDto {
  @ApiProperty({ example: '01712345678' }) @IsString() @MaxLength(20) phone!: string;
  @ApiProperty({ enum: ['DON', 'PAT'] }) @IsIn(['DON', 'PAT']) role!: 'DON' | 'PAT';
  @ApiProperty({ enum: ['bn', 'en'] }) @IsIn(['bn', 'en']) language!: 'bn' | 'en';
}

export class PhoneDto {
  @ApiProperty({ example: '01712345678' }) @IsString() @MaxLength(20) phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty() @IsUUID() challengeId!: string;
  @ApiProperty({ example: '123456' }) @IsString() @Length(6, 6) code!: string;
  @ApiPropertyOptional({ enum: ['DON', 'PAT'], description: 'Registration and SMS-code sign-in' }) @IsOptional() @IsIn(['DON', 'PAT']) role?: 'DON' | 'PAT';
  @ApiPropertyOptional({ enum: ['bn', 'en'], description: 'Registration only' }) @IsOptional() @IsIn(['bn', 'en']) language?: 'bn' | 'en';
  @ApiPropertyOptional({ type: DeviceDto, description: 'SMS-code sign-in only' })
  @ValidateIf((o: VerifyOtpDto) => o.device !== undefined) @ValidateNested() @Type(() => DeviceDto) device?: DeviceDto;
}

export class SetPasswordDto {
  @ApiProperty() @IsString() @MaxLength(2000) setupToken!: string;
  @ApiProperty() @IsString() @MaxLength(256) password!: string;
  @ApiProperty({ type: DeviceDto }) @ValidateNested() @Type(() => DeviceDto) device!: DeviceDto;
}

export class LoginDto {
  @ApiProperty() @IsString() @MaxLength(20) phone!: string;
  @ApiProperty() @IsString() @MaxLength(256) password!: string;
  @ApiPropertyOptional({ enum: ['DON', 'PAT'] }) @IsOptional() @IsIn(['DON', 'PAT']) role?: 'DON' | 'PAT';
  @ApiProperty({ type: DeviceDto }) @ValidateNested() @Type(() => DeviceDto) device!: DeviceDto;
}

export class RefreshDto {
  @ApiProperty() @IsString() @MaxLength(256) refreshToken!: string;
  @ApiPropertyOptional({ type: DeviceProofDto, description: 'Required for devices registered with a public key; subject is the refresh token' })
  @IsOptional() @ValidateNested() @Type(() => DeviceProofDto) proof?: DeviceProofDto;
}

export class StaffMfaDto {
  @ApiProperty() @IsUUID() challengeId!: string;
  @ApiProperty({ example: '123456' }) @IsString() @Length(6, 6) code!: string;
  @ApiPropertyOptional({ enum: ['SUP', 'MOD', 'ADM'] }) @IsOptional() @IsIn(['SUP', 'MOD', 'ADM']) role?: 'SUP' | 'MOD' | 'ADM';
  @ApiProperty({ type: DeviceDto }) @ValidateNested() @Type(() => DeviceDto) device!: DeviceDto;
}

export class ResetPasswordDto {
  @ApiProperty() @IsString() @MaxLength(256) resetToken!: string;
  @ApiProperty() @IsString() @MaxLength(256) password!: string;
  @ApiProperty({ type: DeviceDto }) @ValidateNested() @Type(() => DeviceDto) device!: DeviceDto;
}

export class ChangePasswordDto {
  @ApiProperty() @IsString() @MaxLength(256) currentPassword!: string;
  @ApiProperty() @IsString() @MaxLength(256) newPassword!: string;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() signOutOtherDevices?: boolean;
}

export class StepUpDto {
  @ApiPropertyOptional({ description: 'SMS code step-up (web, or mobile fallback)' }) @IsOptional() @IsUUID() challengeId?: string;
  @ApiPropertyOptional({ example: '123456' }) @IsOptional() @IsString() @Length(6, 6) code?: string;
  @ApiPropertyOptional({ type: DeviceProofDto, description: 'Device-key step-up after biometric or PIN unlock; subject is the session id' })
  @IsOptional() @ValidateNested() @Type(() => DeviceProofDto) proof?: DeviceProofDto;
}

export class AcceptedDto {
  @ApiProperty({ enum: [true] }) accepted!: true;
}

export class TokenPairDto {
  @ApiProperty() accessToken!: string;
  @ApiProperty() refreshToken!: string;
  @ApiProperty() expiresIn!: number;
  @ApiProperty({ enum: ['DON', 'PAT', 'SUP', 'MOD', 'ADM'] }) role!: string;
}

export class MfaChallengeDto {
  @ApiProperty({ enum: [true] }) mfaRequired!: true;
  @ApiProperty() challengeId!: string;
  @ApiProperty() expiresInSeconds!: number;
}

export class OtpChallengeDto {
  @ApiProperty() challengeId!: string;
  @ApiProperty() expiresInSeconds!: number;
}

export class SetupTokenDto {
  @ApiProperty() setupToken!: string;
}

export class ResetTokenDto {
  @ApiProperty() resetToken!: string;
  @ApiProperty() expiresInSeconds!: number;
}

export class ResetOutcomeDto {
  @ApiProperty({ description: 'False for staff, who must sign in again with the 2-step flow' }) signedIn!: boolean;
  @ApiPropertyOptional({ type: TokenPairDto }) tokens?: TokenPairDto;
}

export class StepUpResultDto {
  @ApiProperty() stepUpValidUntil!: Date;
}

export class MeGrantDto {
  @ApiProperty() key!: string;
  @ApiProperty({ enum: ['Own', 'Assigned', 'Area', 'All'] }) scope!: string;
  @ApiProperty() requiresStepUp!: boolean;
}

export class MeDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: ['DON', 'PAT', 'SUP', 'MOD', 'ADM'] }) role!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ type: [String] }) roles!: string[];
  @ApiPropertyOptional({ nullable: true }) stepUpValidUntil!: Date | null;
  @ApiProperty({ type: [MeGrantDto] }) permissions!: MeGrantDto[];
}
