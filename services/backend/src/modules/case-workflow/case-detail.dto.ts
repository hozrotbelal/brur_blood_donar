import { ApiProperty } from '@nestjs/swagger';

export class CaseDonorDto {
  @ApiProperty() id!: string;
  @ApiProperty({ nullable: true, type: String }) donorCode!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) joinedAt!: Date | null;
}

export class CaseAppointmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() caseDonorId!: string;
  @ApiProperty() facilityId!: string;
  @ApiProperty({ nullable: true, type: String }) facility!: string | null;
  @ApiProperty({ format: 'date-time' }) scheduledStart!: Date;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String }) previousAppointmentId!: string | null;
}

export class CaseTaskDto {
  @ApiProperty() id!: string;
  @ApiProperty() taskType!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) dueAt!: Date | null;
  @ApiProperty({ nullable: true, type: String }) assigneeUserId!: string | null;
}

export class CaseNoteViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() noteType!: string;
  @ApiProperty() body!: string;
  @ApiProperty() authorUserId!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
}

export class CaseContactDto {
  @ApiProperty() id!: string;
  @ApiProperty() targetParty!: string;
  @ApiProperty() channel!: string;
  @ApiProperty() result!: string;
  @ApiProperty() attemptedBy!: string;
  @ApiProperty({ format: 'date-time' }) attemptedAt!: Date;
}

export class CaseOutcomeDto {
  @ApiProperty() id!: string;
  @ApiProperty() outcomeType!: string;
  @ApiProperty() sourceType!: string;
  @ApiProperty({ enum: ['Self-reported', 'Service-confirmed'] }) confidence!: string;
  @ApiProperty({ nullable: true, type: Number }) units!: number | null;
  @ApiProperty({ nullable: true, type: String }) reportedByName!: string | null;
  @ApiProperty({ nullable: true, type: String }) reportedByRole!: string | null;
  @ApiProperty() channel!: string;
  @ApiProperty({ format: 'date-time' }) reportedAt!: Date;
  @ApiProperty() disputed!: boolean;
  @ApiProperty({ nullable: true, type: String }) supersedesId!: string | null;
}

export class CaseDetailDto {
  @ApiProperty() id!: string;
  @ApiProperty() caseNo!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty({ nullable: true, type: String }) requestReference!: string | null;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty({ nullable: true, type: String }) ownerUserId!: string | null;
  @ApiProperty() disputed!: boolean;
  @ApiProperty({ type: [CaseDonorDto] }) donors!: CaseDonorDto[];
  @ApiProperty({ type: [CaseAppointmentDto] }) appointments!: CaseAppointmentDto[];
  @ApiProperty({ type: [CaseTaskDto] }) tasks!: CaseTaskDto[];
  @ApiProperty({ type: [CaseNoteViewDto] }) notes!: CaseNoteViewDto[];
  @ApiProperty({ type: [CaseContactDto] }) contacts!: CaseContactDto[];
  @ApiProperty({ type: [CaseOutcomeDto] }) outcomes!: CaseOutcomeDto[];
}

export class CaseStateDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
}

export class CreatedIdDto {
  @ApiProperty() id!: string;
}

export class StaffAppointmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() caseId!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) scheduledStart!: Date;
  @ApiProperty() facilityId!: string;
  @ApiProperty({ nullable: true, type: String }) previousAppointmentId!: string | null;
}

export class OutcomeRecordedDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: ['Self-reported', 'Service-confirmed'] }) confidence!: string;
  @ApiProperty() caseStatus!: string;
}

export class FulfilmentResultDto {
  @ApiProperty() requestStatus!: string;
  @ApiProperty() confirmedUnits!: number;
  @ApiProperty() requestedUnits!: number;
}

export class RequestStatusResultDto {
  @ApiProperty() requestStatus!: string;
}

export class DisputeResultDto {
  @ApiProperty() caseId!: string;
  @ApiProperty() outcomeId!: string;
  @ApiProperty() disputed!: boolean;
}

export class DisputeResolutionDto {
  @ApiProperty() caseId!: string;
  @ApiProperty() outcomeId!: string;
  @ApiProperty({ enum: ['UPHELD', 'CORRECTED'] }) resolution!: string;
  @ApiProperty({ nullable: true, type: String }) correctionId!: string | null;
  @ApiProperty() disputed!: boolean;
}
