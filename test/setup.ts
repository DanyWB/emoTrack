import { Logger } from '@nestjs/common';

const mutedLoggerMethods: Array<keyof Pick<Logger, 'debug' | 'log' | 'verbose'>> = [
  'debug',
  'log',
  'verbose',
];

beforeAll(() => {
  for (const method of mutedLoggerMethods) {
    jest.spyOn(Logger.prototype, method).mockImplementation(() => undefined);
  }
});

afterAll(() => {
  jest.restoreAllMocks();
});
