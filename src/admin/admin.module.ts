import { Module } from '@nestjs/common';

import { AdminRepository } from './admin.repository';
import { AdminService } from './admin.service';

@Module({
  providers: [AdminRepository, AdminService],
  exports: [AdminService],
})
export class AdminModule {}
