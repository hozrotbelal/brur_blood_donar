import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproximateLocationDto {
  @ApiProperty() latitude!: number;
  @ApiProperty() longitude!: number;
}

export class DonorProfileDto {
  @ApiProperty() donorCode!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) bloodGroup!: string | null;
  @ApiProperty() bloodGroupStatus!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) areaId!: string | null;
  @ApiProperty() travelRadiusKm!: number;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) lastDonationDate!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date' }) provisionalNextContactDate!: string | null;
  @ApiProperty() nextContactBasis!: string;
  @ApiProperty() donorStatus!: string;
  @ApiProperty() locationSource!: string;
  @ApiPropertyOptional({ nullable: true, type: ApproximateLocationDto }) approximateLocation!: ApproximateLocationDto | null;
  @ApiProperty() version!: number;
}

export class ConsentViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() type!: string;
  @ApiProperty() granted!: boolean;
  @ApiProperty() policyVersion!: string;
  @ApiProperty({ format: 'date-time' }) capturedAt!: Date;
  @ApiProperty() channel!: string;
  @ApiProperty() language!: string;
}
