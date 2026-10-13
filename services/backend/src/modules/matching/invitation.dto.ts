import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ApproveWaveDto {
  @ApiPropertyOptional({ description: 'Candidates to drop from the proposed batch' })
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) removeCandidateIds?: string[];
  @ApiPropertyOptional({ description: 'Required once the wave number passes the maximum' })
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RespondDto {
  @ApiProperty({ enum: ['Available', 'Later', 'Unavailable'] }) @IsIn(['Available', 'Later', 'Unavailable']) response!: 'Available' | 'Later' | 'Unavailable';
  @ApiPropertyOptional({ description: 'When the donor will be able to answer; needed for Later' }) @IsOptional() @IsDateString() laterAvailableAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsUUID() clientMutationId?: string;
}

export class WithdrawInvitationDto {
  @ApiProperty({ enum: ['SCHEDULE_CONFLICT', 'TRAVEL_PROBLEM', 'ADVISED_NOT_TO_DONATE', 'PERSONAL', 'OTHER'] })
  @IsIn(['SCHEDULE_CONFLICT', 'TRAVEL_PROBLEM', 'ADVISED_NOT_TO_DONATE', 'PERSONAL', 'OTHER']) reason!: string;
}
