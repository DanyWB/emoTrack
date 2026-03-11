import 'reflect-metadata';

import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap(): Promise<void> {
  const bootstrapLogger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const configService = app.get(ConfigService);
  const chartTempDir = configService.get<string>('app.chartTempDir', { infer: true }) ?? './tmp/charts';
  const nodeEnv = configService.get<string>('app.nodeEnv', { infer: true }) ?? 'development';
  const telegramMode = configService.get<string>('telegram.mode', { infer: true }) ?? 'polling';
  const redisEnabled = configService.get<boolean>('app.redisEnabled', { infer: true }) ?? false;
  const jobsEnabled = configService.get<boolean>('app.jobsEnabled', { infer: true }) ?? false;

  try {
    await mkdir(resolve(chartTempDir), { recursive: true });
  } catch (error) {
    bootstrapLogger.warn(`Failed to prepare chart temp dir: ${chartTempDir}`, (error as Error).stack);
  }

  const port = configService.get<number>('app.port', { infer: true }) ?? Number(process.env.PORT ?? 3000);
  await app.listen(port);

  bootstrapLogger.log(
    `emoTrack backend is running on port ${port} (env=${nodeEnv}, telegram=${telegramMode}, redis=${redisEnabled}, jobs=${jobsEnabled})`,
  );
}

void bootstrap();
