import { Injectable } from '@nestjs/common';
import type { PredefinedTag } from '@prisma/client';

import { TagsRepository } from './tags.repository';

@Injectable()
export class TagsService {
  constructor(private readonly tagsRepository: TagsRepository) {}

  getActiveTags() {
    return this.tagsRepository.findActive();
  }

  resolveTagsByKeys(keys: string[]) {
    return this.tagsRepository.findByKeys(keys);
  }

  resolveActiveTagsByIds(ids: string[]): Promise<PredefinedTag[]> {
    if (ids.length === 0) {
      return Promise.resolve([]);
    }

    return this.tagsRepository.findActiveByIds(ids);
  }

  findActiveTagById(id: string): Promise<PredefinedTag | null> {
    return this.tagsRepository.findActiveById(id);
  }
}
