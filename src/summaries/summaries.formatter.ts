import { Injectable } from '@nestjs/common';

@Injectable()
export class SummariesFormatter {
  formatSummaryText(_payload: Record<string, unknown>): string {
    return 'Сводка пока недоступна.';
  }
}
