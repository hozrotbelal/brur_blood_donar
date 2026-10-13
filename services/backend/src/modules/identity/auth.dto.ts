import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, ValidateNested } from 'class-validator';

export class DeviceDto {
  @ApiProperty() @IsString() @Length(8, 128) installId!: string;
  @ApiProperty({ enum: ['android', 'ios'] }) @IsIn(['android', 'ios']) platform!: 'android' | 'ios';
  @ApiProperty() @IsString() @MaxLength(100) model!: string;
  @ApiProperty() @IsString() @MaxLength(50) osVersion!: string;
  @ApiProperty() @IsString() @MaxLength(50) appVersion!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isRooted?: boolean;
}

export class RegisterDto {
  @ApiProperty({ example: '01712345678' }) @IsString() @MaxLength(20) phone!: string;
  @ApiProperty({ enum: ['DON', 'PAT'] }) @IsIn(['DON', 'PAT']) role!: 'DON' | 'PAT';
  @ApiProperty({ enum: ['bn', 'en'] }) @IsIn(['bn', 'en']) language!: 'bn' | 'en';
}

export class VerifyOtpDto {
  @ApiProperty() @IsUUID() challengeId!: string;
  @ApiProperty({ example: '123456' }) @IsString() @Length(6, 6) code!: string;
  @ApiProperty({ enum: ['DON', 'PAT'] }) @IsIn(['DON', 'PAT']) role!: 'DON' | 'PAT';
  @ApiProperty({ enum: ['bn', 'en'] }) @IsIn(['bn', 'en']) language!: 'bn' | 'en';
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
}

export class StaffMfaDto {
  @ApiProperty() @IsUUID() challengeId!: string;
  @ApiProperty({ example: '123456' }) @IsString() @Length(6, 6) code!: string;
  @ApiPropertyOptional({ enum: ['SUP', 'MOD', 'ADM'] }) @IsOptional() @IsIn(['SUP', 'MOD', 'ADM']) role?: 'SUP' | 'MOD' | 'ADM';
  @ApiProperty({ type: DeviceDto }) @ValidateNested() @Type(() => DeviceDto) device!: DeviceDto;
}
