import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const FACILITY_TYPES = ['HOSPITAL', 'COLLECTION_SERVICE', 'CAMPAIGN_SITE'] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export class FacilityQueryDto {
  @ApiPropertyOptional() @IsOptional() @IsUUID() areaId?: string;
  @ApiPropertyOptional({ enum: FACILITY_TYPES }) @IsOptional() @IsIn(FACILITY_TYPES) type?: FacilityType;
  @ApiPropertyOptional({ description: 'Matches English or Bangla name' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ default: 50, maximum: 200 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class FacilityDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: FACILITY_TYPES }) type!: FacilityType;
  @ApiProperty() nameEn!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) nameBn!: string | null;
  @ApiProperty() areaId!: string;
  @ApiProperty() isVerified!: boolean;
  @ApiProperty() supportsBooking!: boolean;
}

export class FacilityPageDto {
  @ApiProperty({ type: [FacilityDto] }) items!: FacilityDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}
