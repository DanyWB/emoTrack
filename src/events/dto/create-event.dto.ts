import { Type } from 'class-transformer';
import { EventType } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateEventDto {
  @IsEnum(EventType, { message: 'Некорректный тип события' })
  eventType!: EventType;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  eventScore!: number;

  @IsDateString()
  eventDate!: string;

  @IsOptional()
  @IsString()
  dailyEntryId?: string;
}
