import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';

const RELATIONSHIPS = ['SELF', 'PARENT', 'CHILD', 'SPOUSE', 'SIBLING', 'OTHER_RELATIVE', 'FRIEND', 'OTHER'] as const;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
const COMPONENTS = ['WHOLE_BLOOD', 'RED_CELLS', 'PLATELETS', 'PLASMA', 'OTHER_AS_STATED'] as const;
const URGENCIES = ['Routine', 'Urgent', 'Critical'] as const;
const CANCEL_REASONS = ['NEED_MET_ELSEWHERE', 'NO_LONGER_REQUIRED', 'DUPLICATE', 'ENTERED_IN_ERROR', 'OTHER'] as const;
const CONTACT_METHODS = ['APP_CHAT', 'PHONE_CALL', 'SMS'] as const;

export class CreatePatientDto {
  @ApiProperty() @IsString() @MaxLength(120) displayName!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsInt() @Min(1900) @Max(2100) yearOfBirth?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) hospitalPatientRef?: string;
  @ApiProperty({ enum: RELATIONSHIPS }) @IsIn(RELATIONSHIPS) relationship!: (typeof RELATIONSHIPS)[number];
}

export class CreateRequestDto {
  @ApiProperty() @IsUUID() patientId!: string;
  @ApiProperty({ enum: BLOOD_GROUPS }) @IsIn(BLOOD_GROUPS) requestedBloodGroup!: (typeof BLOOD_GROUPS)[number];
  @ApiProperty({ enum: COMPONENTS }) @IsIn(COMPONENTS) component!: (typeof COMPONENTS)[number];
  @ApiProperty({ minimum: 1, maximum: 20 }) @Type(() => Number) @IsInt() @Min(1) @Max(20) quantityUnits!: number;
  @ApiProperty() @IsDateString() requiredBy!: string;
  @ApiProperty({ enum: URGENCIES }) @IsIn(URGENCIES) urgency!: (typeof URGENCIES)[number];
  @ApiProperty({ example: '01712345678' }) @IsString() @Matches(/^[+0-9\s-]{8,20}$/) contactPhone!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^[+0-9\s-]{8,20}$/) altContactPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() hospitalFacilityId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() areaId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) specialInstructions?: string;
  @ApiPropertyOptional({ enum: CONTACT_METHODS }) @IsOptional() @IsIn(CONTACT_METHODS) preferredSupportContact?: (typeof CONTACT_METHODS)[number];
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientMutationId?: string;
}

export class CancelRequestDto {
  @ApiProperty({ enum: CANCEL_REASONS }) @IsIn(CANCEL_REASONS) reason!: (typeof CANCEL_REASONS)[number];
}

export class SupplyInformationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) message?: string;
}
