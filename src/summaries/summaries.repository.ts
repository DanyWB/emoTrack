import { Injectable } from '@nestjs/common';
import type { Summary, Prisma } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class SummariesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SummaryUncheckedCreateInput): Promise<Summary> {
    return this.prisma.summary.create({ data });
  }
}
