import { Injectable } from '@nestjs/common';
import type { PredefinedTag } from '@prisma/client';

import { PrismaService } from '../database/prisma.service';

@Injectable()
export class TagsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findActive(): Promise<PredefinedTag[]> {
    return this.prisma.predefinedTag.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  findByKeys(keys: string[]): Promise<PredefinedTag[]> {
    return this.prisma.predefinedTag.findMany({
      where: {
        key: {
          in: keys,
        },
      },
    });
  }
}
