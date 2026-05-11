import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { formatErrorLogEvent } from '../utils/logging.utils';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const err = exception instanceof Error ? exception : new Error(String(exception));

    if (host.getType() !== 'http') {
      this.logger.error(formatErrorLogEvent('non_http_unhandled_exception', exception), err.stack);
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const message =
      exception instanceof HttpException
        ? exception.message
        : 'Внутренняя ошибка сервиса. Попробуйте позже.';

    if (!(exception instanceof HttpException)) {
      this.logger.error(formatErrorLogEvent('http_unhandled_exception', exception, {
        method: request.method,
        path: request.url,
        status,
      }), err.stack);
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
