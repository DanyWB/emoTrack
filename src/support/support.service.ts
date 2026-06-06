import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { SupportConfig } from '../config/support.config';

@Injectable()
export class SupportService {
  constructor(private readonly configService: ConfigService) {}

  getSupportUrl(): string | undefined {
    const support = this.configService.get<SupportConfig>('support', { infer: true });
    return support?.url;
  }
}
