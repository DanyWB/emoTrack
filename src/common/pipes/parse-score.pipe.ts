import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

@Injectable()
export class ParseScorePipe implements PipeTransform<string, number> {
  transform(value: string): number {
    const parsed = Number(value);

    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10) {
      throw new BadRequestException('Ожидается целое число от 0 до 10.');
    }

    return parsed;
  }
}
