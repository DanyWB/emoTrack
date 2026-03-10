import { Type } from 'class-transformer';
import { EventType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { TEXT_LIMITS } from '../../common/constants/app.constants';

export class CreateEventDto {
  @IsEnum(EventType, { message: 'Некорректный тип события' })
  eventType!: EventType;

  @IsString()
  @IsNotEmpty({ message: 'Укажи название события' })
  @MaxLength(TEXT_LIMITS.eventTitle, {
    message: `Название события должно быть не длиннее ${TEXT_LIMITS.eventTitle} символов`,
  })
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(TEXT_LIMITS.eventDescription, {
    message: `Описание должно быть не длиннее ${TEXT_LIMITS.eventDescription} символов`,
  })
  description?: string;

  @Type(() => Number)
  @IsInt({ message: 'Оценка события должна быть целым числом от 0 до 10' })
  @Min(0, { message: 'Оценка события должна быть от 0 до 10' })
  @Max(10, { message: 'Оценка события должна быть от 0 до 10' })
  eventScore!: number;

  @IsDateString()
  eventDate!: string;

  @IsOptional()
  @IsString()
  dailyEntryId?: string;
}
