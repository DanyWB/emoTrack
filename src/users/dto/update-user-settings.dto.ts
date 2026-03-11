import { SleepMode } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, Matches } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsOptional()
  @IsBoolean()
  remindersEnabled?: boolean;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/, {
    message: 'Время напоминания должно быть в формате HH:mm',
  })
  reminderTime?: string;

  @IsOptional()
  @IsEnum(SleepMode, { message: 'Некорректный режим сна' })
  sleepMode?: SleepMode;

  @IsOptional()
  @IsBoolean()
  notesEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  tagsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  eventsEnabled?: boolean;
}
