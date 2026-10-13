import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const MISSING_ITEMS = [
  'DOCUMENT_MISSING', 'DOCUMENT_ILLEGIBLE', 'BLOOD_GROUP_MISMATCH', 'COMPONENT_MISMATCH', 'FACILITY_UNCLEAR', 'CONTACT_UNREACHABLE', 'OTHER',
] as const;
export const REJECT_REASONS = ['DUPLICATE', 'SUSPECTED_MISUSE', 'NO_GENUINE_NEED', 'DOCUMENT_INVALID', 'UNREACHABLE', 'OTHER'] as const;

export class RequestInformationDto {
  @ApiProperty({ enum: MISSING_ITEMS, isArray: true })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(MISSING_ITEMS.length) @ArrayUnique() @IsIn(MISSING_ITEMS, { each: true })
  items!: (typeof MISSING_ITEMS)[number][];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) message?: string;
}

export class VerifyRequestDto {
  @ApiProperty() @IsBoolean() documentLegible!: boolean;
  @ApiProperty() @IsBoolean() bloodGroupAndComponentMatch!: boolean;
  @ApiProperty() @IsBoolean() facilityExists!: boolean;
  @ApiProperty() @IsBoolean() representativeReachable!: boolean;
  @ApiProperty() @IsBoolean() noDuplicate!: boolean;
  @ApiProperty() @IsBoolean() urgencyConsistent!: boolean;
}

export class RejectRequestDto {
  @ApiProperty({ enum: REJECT_REASONS }) @IsIn(REJECT_REASONS) reasonCode!: (typeof REJECT_REASONS)[number];
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) explanation!: string;
}


export class PauseOutreachDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class ResolveFlagDto {
  @ApiProperty({ enum: ['Dismissed', 'Confirmed'] }) @IsIn(['Dismissed', 'Confirmed']) resolution!: 'Dismissed' | 'Confirmed';
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(500) note!: string;
}
