import { Injectable } from '@nestjs/common';

import { toLogErrorDetails } from '../common/utils/logging.utils';
import type { TelegramMode } from '../config/telegram.config';

export type TelegramRuntimeState = 'pending' | 'ready' | 'skipped' | 'failed';

export interface TelegramRuntimeSnapshot {
  status: TelegramRuntimeState;
  mode: TelegramMode;
  required: boolean;
  reason?: string;
  errorMessage?: string;
  updatedAt: string;
}

@Injectable()
export class TelegramRuntimeStatusService {
  private snapshot: TelegramRuntimeSnapshot = {
    status: 'pending',
    mode: 'polling',
    required: false,
    updatedAt: new Date(0).toISOString(),
  };

  markStarting(mode: TelegramMode, required: boolean): void {
    this.snapshot = {
      status: 'pending',
      mode,
      required,
      updatedAt: new Date().toISOString(),
    };
  }

  markReady(mode: TelegramMode): void {
    this.snapshot = {
      status: 'ready',
      mode,
      required: true,
      updatedAt: new Date().toISOString(),
    };
  }

  markSkipped(mode: TelegramMode, reason: string): void {
    this.snapshot = {
      status: 'skipped',
      mode,
      required: false,
      reason,
      updatedAt: new Date().toISOString(),
    };
  }

  markFailed(mode: TelegramMode, error: unknown, reason = 'telegram_runtime_failed'): void {
    const details = toLogErrorDetails(error);

    this.snapshot = {
      status: 'failed',
      mode,
      required: true,
      reason,
      errorMessage: details.message,
      updatedAt: new Date().toISOString(),
    };
  }

  getSnapshot(): TelegramRuntimeSnapshot {
    return { ...this.snapshot };
  }
}
