import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export const AREA_LEVELS = ['DIVISION', 'DISTRICT', 'UPAZILA', 'UNION'] as const;
export type AreaLevel = (typeof AREA_LEVELS)[number];

export class AreaQueryDto {
  @ApiPropertyOptional({ enum: AREA_LEVELS }) @IsOptional() @IsIn(AREA_LEVELS) level?: AreaLevel;
  @ApiPropertyOptional() @IsOptional() @IsUUID() parentId?: string;
  @ApiPropertyOptional({ description: 'Matches code, English or Bangla name' }) @IsOptional() @IsString() @MaxLength(100) q?: string;
  @ApiPropertyOptional({ default: 50, maximum: 200 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class AreaDto {
  @ApiProperty() id!: string;
  @ApiPropertyOptional({ nullable: true }) parentId!: string | null;
  @ApiProperty({ enum: AREA_LEVELS }) level!: AreaLevel;
  @ApiProperty() code!: string;
  @ApiProperty() nameEn!: string;
  @ApiProperty() nameBn!: string;
}

export class AreaPageDto {
  @ApiProperty({ type: [AreaDto] }) items!: AreaDto[];
  @ApiProperty() total!: number;
  @ApiProperty() limit!: number;
  @ApiProperty() offset!: number;
}
