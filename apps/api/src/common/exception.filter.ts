import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody } from '@spms/shared';
import type { Response } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from './app-exception.js';

const CODES_BY_STATUS: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'TOO_MANY_REQUESTS',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const [status, body] = this.toErrorResponse(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }
    response.status(status).json(body);
  }

  private toErrorResponse(exception: unknown): [number, ApiErrorBody] {
    if (exception instanceof AppException) {
      const { code, message, details } = exception;
      return [exception.getStatus(), { error: { code, message, details } }];
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002':
          return [
            HttpStatus.CONFLICT,
            { error: { code: 'ALREADY_EXISTS', message: 'A record with the same value already exists' } },
          ];
        case 'P2003':
          return [
            HttpStatus.CONFLICT,
            { error: { code: 'IN_USE', message: 'This record is used by other records' } },
          ];
        case 'P2025':
          return [HttpStatus.NOT_FOUND, { error: { code: 'NOT_FOUND', message: 'Record not found' } }];
      }
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const raw =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      const message = Array.isArray(raw) ? raw.join('; ') : raw;
      return [status, { error: { code: CODES_BY_STATUS[status] ?? 'HTTP_ERROR', message } }];
    }

    return [
      HttpStatus.INTERNAL_SERVER_ERROR,
      { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } },
    ];
  }
}
