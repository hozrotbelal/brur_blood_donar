import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RequestMilestonesDto {
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) submittedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) verifiedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) searchStartedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) donorWillingAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) donationReportedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) outcomeConfirmedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) fulfilledAt!: Date | null;
}

export class FacilityNameDto {
  @ApiProperty() nameEn!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameBn!: string | null;
}

export class RequestViewDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) referenceNo!: string | null;
  @ApiProperty() patientId!: string;
  @ApiProperty() patientName!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) patientRef!: string | null;
  @ApiProperty() requestedBloodGroup!: string;
  @ApiProperty() component!: string;
  @ApiProperty() quantityUnits!: number;
  @ApiProperty({ format: 'date-time' }) requiredBy!: Date;
  @ApiProperty() urgency!: string;
  @ApiProperty() priority!: string;
  @ApiProperty() status!: string;
  @ApiProperty() outreachPaused!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) cancelReason!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) contactPhone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) altContactPhone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) specialInstructions!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) hospitalFacilityId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) collectionFacilityId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: FacilityNameDto }) hospital!: FacilityNameDto | null;
  @ApiPropertyOptional({ nullable: true, type: FacilityNameDto }) collectionDestination!: FacilityNameDto | null;
  @ApiPropertyOptional({ nullable: true, enum: ['Self-reported', 'Service-confirmed'] }) outcomeConfidence!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ format: 'date-time' }) updatedAt!: Date;
  @ApiProperty() version!: number;
  @ApiProperty({ type: RequestMilestonesDto }) milestones!: RequestMilestonesDto;
}

export class RequestProgressDto {
  @ApiProperty() contacted!: number;
  @ApiProperty() responded!: number;
  @ApiProperty() willing!: number;
  @ApiProperty() searchWave!: number;
}

export class TimelineEntryDto {
  @ApiProperty({ format: 'date-time' }) at!: Date;
  @ApiPropertyOptional({ nullable: true, type: String }) from!: string | null;
  @ApiProperty() to!: string;
  @ApiProperty({ description: 'Role only; staff are never named' }) actorRole!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) reasonCode!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) reason!: string | null;
  @ApiPropertyOptional({ type: [String] }) missingItems?: string[];
}

export class RequestChangeDto {
  @ApiProperty() id!: string;
  @ApiProperty() changeType!: string;
  @ApiProperty() isMaterial!: boolean;
  @ApiProperty({ enum: ['Pending', 'Approved', 'Rejected', 'Withdrawn', 'Auto-applied'] }) status!: string;
  @ApiProperty({ type: 'object', additionalProperties: true }) proposedValues!: Record<string, unknown>;
  @ApiProperty({ type: 'object', additionalProperties: true }) previousValues!: Record<string, unknown>;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class RequestChangeResultDto {
  @ApiProperty({ type: RequestViewDto }) request!: RequestViewDto;
  @ApiProperty({ type: [RequestChangeDto] }) changes!: RequestChangeDto[];
}

export class PatientListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() displayName!: string;
  @ApiProperty() relationship!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) hospitalPatientRef!: string | null;
}
