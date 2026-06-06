import { registerAs } from '@nestjs/config';

export interface SupportConfig {
  url?: string;
}

export default registerAs('support', (): SupportConfig => ({
  url: process.env.SUPPORT_URL?.trim() || undefined,
}));
