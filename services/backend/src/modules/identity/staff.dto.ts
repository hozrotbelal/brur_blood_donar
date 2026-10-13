import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Length, MaxLength, MinLength } from 'class-validator';

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
