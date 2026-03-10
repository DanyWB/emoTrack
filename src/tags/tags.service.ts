import { Injectable } from '@nestjs/common';

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
}
