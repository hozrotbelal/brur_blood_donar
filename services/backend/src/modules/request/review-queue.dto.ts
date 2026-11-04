import { RequestChangeDto } from './request-view.dto';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewQueueItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() referenceNo!: string;
  @ApiProperty() patientName!: string;
  @ApiProperty() requestedBloodGroup!: string;
  @ApiProperty() component!: string;
  @ApiProperty() quantityUnits!: number;
  @ApiProperty({ format: 'date' }) requiredBy!: string;
  @ApiProperty() urgency!: string;
  @ApiProperty() priority!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String }) areaId!: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Masked phone number' }) contactPhone!: string | null;
  @ApiProperty() hasModerationHold!: boolean;
  @ApiProperty({ nullable: true, type: String }) assignedSupportUserId!: string | null;
  @ApiProperty({ format: 'date-time' }) submittedAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) firstActionAt!: string | null;
  @ApiProperty() version!: number;
}

export class ReviewFlagDto {
  @ApiProperty() id!: string;
  @ApiProperty() flagType!: string;
  @ApiProperty({ nullable: true, type: String }) matchedRequestId!: string | null;
  @ApiProperty({ nullable: true, type: String }) matchedReferenceNo!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true }) detail!: Record<string, unknown>;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) resolvedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) resolutionNote!: string | null;
}

export class ReviewRequestDetailDto extends ReviewQueueItemDto {
  @ApiProperty({ type: [ReviewFlagDto] }) flags!: ReviewFlagDto[];
  @ApiProperty({ type: [RequestChangeDto] }) changes!: RequestChangeDto[];
}
