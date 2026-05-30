import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export interface DailyMetricValueInput {
  key: string;
  value: number;
}

export interface DailyEntryV2MetricValueInput {
  key: string;
  ordinalValue: number;
  tagKeys?: string[];
}

export class UpsertDailyEntryDto {
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  moodScore?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  energyScore?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  stressScore?: number;

  @Type(() => Number)
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(24)
  sleepHours?: number;

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  sleepQuality?: number;

  @IsOptional()
  @IsString()
  noteText?: string;

  @IsOptional()
  metricValues?: DailyMetricValueInput[];

  @IsOptional()
  v2MetricValues?: DailyEntryV2MetricValueInput[];
}
