import { Controller, Get } from '@nestjs/common';

import { HealthService, type LivenessPayload, type ReadinessPayload } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  getLiveness(): LivenessPayload {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  getReadiness(): Promise<ReadinessPayload> {
    return this.healthService.getReadiness();
  }
}
