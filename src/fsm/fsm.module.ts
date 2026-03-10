import { Module } from '@nestjs/common';

import { FsmRepository } from './fsm.repository';
import { FsmService } from './fsm.service';

@Module({
  providers: [FsmRepository, FsmService],
  exports: [FsmRepository, FsmService],
})
export class FsmModule {}
