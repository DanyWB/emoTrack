import { Injectable } from '@nestjs/common';

@Injectable()
export class RemindersService {
  scheduleDailyReminder(_userId: string): Promise<void> {
    return Promise.resolve();
  }

  rescheduleDailyReminder(_userId: string): Promise<void> {
    return Promise.resolve();
  }

  cancelDailyReminder(_userId: string): Promise<void> {
    return Promise.resolve();
  }

  enqueueWeeklySummary(_userId: string): Promise<void> {
    return Promise.resolve();
  }

  sendDailyReminder(_userId: string): Promise<void> {
    return Promise.resolve();
  }

  shouldSendReminder(_userId: string, _date: Date): Promise<boolean> {
    return Promise.resolve(true);
  }
}
