import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { notificationCategoryEnum } from '../../platform/db/enums';
import { NotificationCategory } from '../identity/read-model.public';

export class NotificationItemDto {
  @ApiProperty() id!: string;
  @ApiProperty() eventCode!: string;
  @ApiProperty({ enum: notificationCategoryEnum.enumValues }) category!: NotificationCategory;
  @ApiPropertyOptional({ nullable: true, type: String }) title!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) body!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: Date;
  @ApiProperty() read!: boolean;
  @ApiPropertyOptional({ nullable: true, type: String }) requestId!: string | null;
  @ApiPropertyOptional({ nullable: true, type: String }) invitationId!: string | null;
  @ApiProperty() critical!: boolean;
}

export class UnreadCountDto {
  @ApiProperty() unread!: number;
}
