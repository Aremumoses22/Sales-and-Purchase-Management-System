import { HttpStatus, StandardSchemaValidationPipe } from '@nestjs/common';
import type { ValidationIssue } from '@spms/shared';
import { z } from 'zod';
import { AppException } from './app-exception.js';

interface StandardIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export function toValidationException(issues: readonly StandardIssue[]): AppException {
  const details: ValidationIssue[] = issues.map((issue) => ({
    path: (issue.path ?? [])
      .map((segment) => String(typeof segment === 'object' ? segment.key : segment))
      .join('.'),
    message: issue.message,
  }));
  return new AppException(
    'VALIDATION_ERROR',
    'Some fields are invalid. Please check and try again.',
    HttpStatus.BAD_REQUEST,
    details,
  );
}

export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({ exceptionFactory: toValidationException });
}

export const uuidParam = z.uuid('Invalid id');
