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

  findActiveByIds(ids: string[]): Promise<PredefinedTag[]> {
    return this.prisma.predefinedTag.findMany({
      where: {
        id: {
          in: ids,
        },
        isActive: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  findActiveById(id: string): Promise<PredefinedTag | null> {
    return this.prisma.predefinedTag.findFirst({
      where: {
        id,
        isActive: true,
      },
    });
  }
}
