import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class InviteStaffDto {
  @ApiProperty({ example: '01712345678' }) @IsString() @MaxLength(20) phone!: string;
  @ApiProperty({ enum: ['SUP', 'MOD', 'ADM'] }) @IsIn(['SUP', 'MOD', 'ADM']) roleCode!: 'SUP' | 'MOD' | 'ADM';
  @ApiProperty({ example: 'TIER_SUPPORT_AGENT' }) @IsString() @MaxLength(60) tierCode!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) areaIds?: string[];
}

export class AcceptStaffInvitationDto {
  @ApiProperty() @IsString() @Length(20, 200) token!: string;
  @ApiProperty() @IsString() @MaxLength(256) password!: string;
  @ApiProperty({ enum: ['bn', 'en'] }) @IsIn(['bn', 'en']) language!: 'bn' | 'en';
}

export class ChangeAssignmentDto {
  @ApiProperty() @IsString() @MaxLength(60) tierCode!: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) areaIds?: string[];
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class StaffInvitationDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'Last four digits of the invited number' }) phoneLast4!: string;
  @ApiProperty() roleCode!: string;
  @ApiProperty({ nullable: true, type: String }) tierCode!: string | null;
  @ApiProperty({ type: [String] }) areaIds!: string[];
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) expiresAt!: string;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) acceptedAt!: string | null;
}

export class StaffInvitationCreatedDto {
  @ApiProperty() id!: string;
  @ApiProperty() expiresInDays!: number;
}

export class StaffMemberDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ description: 'Last four digits of the phone number' }) phoneLast4!: string;
  @ApiProperty({ nullable: true, type: String, enum: ['SUP', 'MOD', 'ADM'] }) roleCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) tierCode!: string | null;
  @ApiProperty({ type: [String] }) areaIds!: string[];
  @ApiProperty({ enum: ['Active', 'Deactivated', 'Locked', 'Suspended'] }) status!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) lastLoginAt!: Date | null;
}

export class StaffReasonDto {
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class OpenCaseRefDto {
  @ApiProperty() id!: string;
  @ApiProperty() caseNo!: string;
  @ApiProperty() requestId!: string;
}

export class StaffDeactivatedDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ enum: ['Deactivated'] }) status!: string;
  @ApiProperty({ type: [OpenCaseRefDto], description: 'Open cases the person owned; reassign them' }) openCases!: OpenCaseRefDto[];
}

export class DeviceResetDto {
  @ApiProperty() userId!: string;
  @ApiProperty() devicesRevoked!: number;
}

export class AssignmentChangedDto {
  @ApiProperty() userId!: string;
  @ApiProperty() tierCode!: string;
  @ApiProperty({ type: [String] }) areaIds!: string[];
}

export class PermissionItemDto {
  @ApiProperty() key!: string;
  @ApiProperty({ enum: ['Own', 'Assigned', 'Area', 'All'] }) scope!: string;
  @ApiProperty() descriptionEn!: string;
  @ApiProperty() descriptionBn!: string;
  @ApiProperty() sensitive!: boolean;
  @ApiProperty() requiresStepUp!: boolean;
}

export class PermissionSetViewDto {
  @ApiProperty() code!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() nameBn!: string;
  @ApiProperty({ enum: ['DON', 'PAT', 'SUP', 'MOD', 'ADM'] }) roleCode!: string;
  @ApiProperty({ enum: ['BASE', 'TIER', 'SCOPE', 'CUSTOM'] }) kind!: string;
  @ApiProperty({ nullable: true, type: Number }) tierRank!: number | null;
  @ApiProperty({ type: [PermissionItemDto] }) items!: PermissionItemDto[];
}

export class AccessReviewGrantDto {
  @ApiProperty() grantId!: string;
  @ApiProperty() setCode!: string;
  @ApiProperty() setNameEn!: string;
  @ApiProperty() setNameBn!: string;
  @ApiProperty({ enum: ['SCOPE', 'CUSTOM'] }) kind!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) expiresAt!: Date | null;
  @ApiProperty({ type: [String] }) sensitiveKeys!: string[];
  @ApiProperty({ nullable: true, type: String, enum: ['KEEP', 'REVOKE'] }) decision!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) decidedAt!: Date | null;
}

export class AccessReviewMemberDto {
  @ApiProperty() userId!: string;
  @ApiProperty({ nullable: true, type: String }) displayName!: string | null;
  @ApiProperty({ nullable: true, type: String }) roleCode!: string | null;
  @ApiProperty({ nullable: true, type: String }) tierCode!: string | null;
  @ApiProperty() reveals!: number;
  @ApiProperty() searches!: number;
  @ApiProperty({ type: [AccessReviewGrantDto] }) grants!: AccessReviewGrantDto[];
}

export class AccessReviewDto {
  @ApiProperty({ example: '2026-11' }) month!: string;
  @ApiProperty({ type: [AccessReviewMemberDto] }) members!: AccessReviewMemberDto[];
}

export class AccessReviewQueryDto {
  @ApiPropertyOptional({ example: '2026-11', description: 'Month in Asia/Dhaka time; defaults to the current month' })
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) month?: string;
}

export class GrantDecisionDto {
  @ApiProperty({ enum: ['KEEP', 'REVOKE'] }) @IsIn(['KEEP', 'REVOKE']) decision!: 'KEEP' | 'REVOKE';
  @ApiProperty() @IsString() @MinLength(5) @MaxLength(500) reason!: string;
}

export class GrantDecisionResultDto {
  @ApiProperty() grantId!: string;
  @ApiProperty({ enum: ['KEEP', 'REVOKE'] }) decision!: string;
}
