import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, ValidateNested, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';

export const OUTCOME_TYPES = ['DONATION_COMPLETED', 'DONATION_NOT_COMPLETED', 'UNITS_RECEIVED_BY_PATIENT_SERVICE', 'NEED_CHANGED', 'NEED_NO_LONGER_REQUIRED'] as const;
export const STAFF_OUTCOME_SOURCES = ['COLLECTION_SERVICE_CONFIRMATION', 'HOSPITAL_CONFIRMATION', 'SUPPORT_OBSERVATION'] as const;

export class NoteDto {
  @ApiProperty() @IsString() @MinLength(1) @MaxLength(2000) body!: string;
  @ApiPropertyOptional({ enum: ['GENERAL', 'HANDOVER', 'ESCALATION', 'EXTERNAL_CONTACT'] })
  @IsOptional() @IsIn(['GENERAL', 'HANDOVER', 'ESCALATION', 'EXTERNAL_CONTACT']) noteType?: 'GENERAL' | 'HANDOVER' | 'ESCALATION' | 'EXTERNAL_CONTACT';
}

export class ContactAttemptDto {
  @ApiProperty({ enum: ['DONOR', 'REPRESENTATIVE', 'HOSPITAL', 'COLLECTION_SERVICE', 'OTHER_EXTERNAL'] })
  @IsIn(['DONOR', 'REPRESENTATIVE', 'HOSPITAL', 'COLLECTION_SERVICE', 'OTHER_EXTERNAL']) party!: string;
  @ApiProperty({ enum: ['PHONE_CALL', 'SMS', 'IN_APP_MESSAGE'] }) @IsIn(['PHONE_CALL', 'SMS', 'IN_APP_MESSAGE']) channel!: string;
  @ApiProperty({ enum: ['REACHED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'LEFT_MESSAGE'] })
  @IsIn(['REACHED', 'NO_ANSWER', 'BUSY', 'WRONG_NUMBER', 'CALLBACK_REQUESTED', 'LEFT_MESSAGE']) result!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() caseDonorId?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() facilityId?: string;
  @ApiPropertyOptional({ description: 'Name and role of the external person, kept as a case note' }) @IsOptional() @IsString() @MaxLength(200) externalPerson?: string;
}

export class ProposeAppointmentDto {
  @ApiProperty() @IsUUID() caseDonorId!: string;
  @ApiProperty() @IsUUID() facilityId!: string;
  @ApiProperty() @IsDateString() scheduledStart!: string;
}

export class RescheduleDto {
  @ApiProperty() @IsDateString() scheduledStart!: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() facilityId?: string;
}

export class TimingProblemDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class WithdrawDto {
  @ApiProperty({ enum: ['SCHEDULE_CONFLICT', 'TRAVEL_PROBLEM', 'ADVISED_NOT_TO_DONATE', 'PERSONAL', 'OTHER'] })
  @IsIn(['SCHEDULE_CONFLICT', 'TRAVEL_PROBLEM', 'ADVISED_NOT_TO_DONATE', 'PERSONAL', 'OTHER']) reason!: string;
}

export class RecordOutcomeDto {
  @ApiProperty({ enum: STAFF_OUTCOME_SOURCES }) @IsIn(STAFF_OUTCOME_SOURCES) sourceType!: (typeof STAFF_OUTCOME_SOURCES)[number];
  @ApiProperty({ enum: OUTCOME_TYPES }) @IsIn(OUTCOME_TYPES) outcomeType!: (typeof OUTCOME_TYPES)[number];
  @ApiProperty({ enum: ['PHONE', 'IN_APP'] }) @IsIn(['PHONE', 'IN_APP']) channel!: 'PHONE' | 'IN_APP';
  @ApiPropertyOptional({ minimum: 0, maximum: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) units?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) reportedByName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) reportedByRole?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() reportedAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() caseDonorId?: string;
  @ApiPropertyOptional({ description: 'Free text without clinical detail' }) @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class MoreDonorsDto {
  @ApiProperty() @IsBoolean() needed!: boolean;
}

export class DeclareUnableDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class CloseCaseDto {
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) note!: string;
}

export class DisputeOutcomeDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class ResolveDisputeDto {
  @ApiProperty({ enum: ['UPHELD', 'CORRECTED'] }) @IsIn(['UPHELD', 'CORRECTED']) resolution!: 'UPHELD' | 'CORRECTED';
  @ApiProperty() @IsString() @MinLength(3) @MaxLength(1000) note!: string;
  @ApiPropertyOptional({ type: RecordOutcomeDto, description: 'Required when the resolution is CORRECTED' })
  @IsOptional() @ValidateNested() @Type(() => RecordOutcomeDto) correction?: RecordOutcomeDto;
}
