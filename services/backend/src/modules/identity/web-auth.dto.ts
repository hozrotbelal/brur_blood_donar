import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength } from 'class-validator';

export class WebLoginDto {
  @ApiProperty() @IsString() @MaxLength(20) phone!: string;
  @ApiProperty() @IsString() @MaxLength(256) password!: string;
  @ApiPropertyOptional({ enum: ['SUP', 'MOD', 'ADM', 'DON', 'PAT'], description: 'Staff roles use the staff portal; DON and PAT are public users (ADR-15 Amendment 1)' })
  @IsOptional() @IsIn(['SUP', 'MOD', 'ADM', 'DON', 'PAT']) role?: 'SUP' | 'MOD' | 'ADM' | 'DON' | 'PAT';
}

export class WebMfaChallengeDto {
  @ApiProperty({ enum: [true] }) mfaRequired!: true;
  @ApiProperty() challengeId!: string;
  @ApiProperty() expiresInSeconds!: number;
}

export class WebSignedInDto {
  @ApiProperty({ description: 'Short-lived access token; keep in memory only' }) accessToken!: string;
  @ApiProperty() expiresIn!: number;
  @ApiProperty({ enum: ['SUP', 'MOD', 'ADM', 'DON', 'PAT'] }) role!: 'SUP' | 'MOD' | 'ADM' | 'DON' | 'PAT';
  @ApiProperty({ description: 'Send back in the X-CSRF-Token header on refresh and logout' }) csrfToken!: string;
}

export class WebStaffVerifyDto {
  @ApiProperty() @IsUUID() challengeId!: string;
  @ApiProperty({ example: '123456' }) @IsString() @Length(6, 6) code!: string;
  @ApiPropertyOptional({ enum: ['SUP', 'MOD', 'ADM'] }) @IsOptional() @IsIn(['SUP', 'MOD', 'ADM']) role?: 'SUP' | 'MOD' | 'ADM';
  @ApiPropertyOptional({ description: 'Skip the SMS code on this browser until the trusted-browser period ends' })
  @IsOptional() @IsBoolean() trustBrowser?: boolean;
}
