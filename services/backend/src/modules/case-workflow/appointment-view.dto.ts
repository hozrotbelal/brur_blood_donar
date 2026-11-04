import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DonorFacilityDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) phone!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) directionsUrl!: string | null;
}

export class DonorAppointmentDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiProperty({ format: 'date-time' }) scheduledStart!: Date;
  @ApiProperty({ type: DonorFacilityDto }) facility!: DonorFacilityDto;
}
