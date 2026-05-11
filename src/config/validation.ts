import { Transform, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

function toOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toBoolean(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off', ''].includes(normalized)) {
      return false;
    }
  }

  return value;
}

class EnvironmentVariables {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT!: number;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @Transform(({ value }) => toOptionalString(value))
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @Transform(({ value }) => (value === undefined ? false : toBoolean(value)))
  @IsBoolean()
  REDIS_ENABLED!: boolean;

  @Transform(({ value }) => (value === undefined ? false : toBoolean(value)))
  @IsBoolean()
  JOBS_ENABLED!: boolean;

  @IsString()
  @IsNotEmpty()
  TELEGRAM_BOT_TOKEN!: string;

  @Transform(({ value }) => toOptionalString(value) ?? 'polling')
  @IsIn(['polling', 'webhook'])
  TELEGRAM_MODE!: 'polling' | 'webhook';

  @Transform(({ value }) => toOptionalString(value))
  @IsOptional()
  @IsString()
  TELEGRAM_WEBHOOK_URL?: string;

  @Transform(({ value }) => toOptionalString(value))
  @IsOptional()
  @IsString()
  TELEGRAM_WEBHOOK_SECRET?: string;

  @Transform(({ value }) => (value === undefined || value === '' ? 10000 : Number(value)))
  @IsInt()
  @Min(1000)
  @Max(60000)
  TELEGRAM_STARTUP_TIMEOUT_MS!: number;

  @IsString()
  @IsNotEmpty()
  DEFAULT_TIMEZONE!: string;

  @IsString()
  @IsNotEmpty()
  CHART_TEMP_DIR!: string;
}

function validateConditionalRules(env: EnvironmentVariables): string[] {
  const errors: string[] = [];

  if (env.JOBS_ENABLED && !env.REDIS_ENABLED) {
    errors.push('JOBS_ENABLED=true requires REDIS_ENABLED=true.');
  }

  if ((env.REDIS_ENABLED || env.JOBS_ENABLED) && !env.REDIS_URL) {
    errors.push('REDIS_URL is required when REDIS_ENABLED=true or JOBS_ENABLED=true.');
  }

  if (env.TELEGRAM_MODE === 'webhook' && !env.TELEGRAM_WEBHOOK_URL) {
    errors.push('TELEGRAM_WEBHOOK_URL is required when TELEGRAM_MODE=webhook.');
  }

  return errors;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const classValidatorErrors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (classValidatorErrors.length > 0) {
    throw new Error(`Environment validation failed: ${JSON.stringify(classValidatorErrors, null, 2)}`);
  }

  const conditionalErrors = validateConditionalRules(validated);

  if (conditionalErrors.length > 0) {
    throw new Error(`Environment validation failed: ${conditionalErrors.join(' ')}`);
  }

  return validated;
}
