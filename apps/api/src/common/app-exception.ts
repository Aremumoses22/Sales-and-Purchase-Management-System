import { HttpException, HttpStatus } from '@nestjs/common';

/** Error with a stable machine-readable code, rendered as `{ error: { code, message, details } }`. */
export class AppException extends HttpException {
  constructor(
    readonly code: string,
    message: string,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
    readonly details?: unknown,
  ) {
    super(message, status);
  }
}

export function notFound(label: string): AppException {
  return new AppException('NOT_FOUND', `${label} not found`, HttpStatus.NOT_FOUND);
}

export function conflict(code: string, message: string, details?: unknown): AppException {
  return new AppException(code, message, HttpStatus.CONFLICT, details);
}

/** A business-rule failure tied to one form field, shown inline like a validation error. */
export function fieldError(code: string, path: string, message: string): AppException {
  return new AppException(code, message, HttpStatus.BAD_REQUEST, [{ path, message }]);
}
