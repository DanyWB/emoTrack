import { Module } from '@nestjs/common';

import { TagsRepository } from './tags.repository';
import { TagsService } from './tags.service';

@Module({
  providers: [TagsRepository, TagsService],
  exports: [TagsRepository, TagsService],
})
export class TagsModule {}
