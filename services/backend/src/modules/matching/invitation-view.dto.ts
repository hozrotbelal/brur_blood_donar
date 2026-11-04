import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InvitationViewDto {
  @ApiProperty() id!: string;
  @ApiProperty() status!: string;
  @ApiPropertyOptional({ nullable: true, type: String }) response!: string | null;
  @ApiProperty({ format: 'date-time' }) expiresAt!: Date;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) sentAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: String, format: 'date-time' }) respondedAt!: Date | null;
  @ApiPropertyOptional({ nullable: true, type: 'object', additionalProperties: true }) details!: Record<string, unknown> | null;
  @ApiProperty() notice!: string;
}
