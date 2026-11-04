import { ApiProperty } from '@nestjs/swagger';

export class CaseListItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() caseNo!: string;
  @ApiProperty() status!: string;
  @ApiProperty() priority!: string;
  @ApiProperty() requestId!: string;
  @ApiProperty({ nullable: true, type: String }) requestReference!: string | null;
  @ApiProperty({ format: 'date-time' }) openedAt!: string;
  @ApiProperty() overdue!: boolean;
}
