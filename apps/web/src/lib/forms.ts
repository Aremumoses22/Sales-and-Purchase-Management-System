'use client';

import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';
import { ApiError } from './api';

/**
 * Shows an API failure where the user can act on it: field errors go next to the field,
 * anything else becomes a toast.
 */
export function applyApiError<TFieldValues extends FieldValues, TContext, TTransformed extends FieldValues>(
  error: unknown,
  form: UseFormReturn<TFieldValues, TContext, TTransformed>,
  fallbackField?: Path<TFieldValues>,
): void {
  if (!(error instanceof ApiError)) {
    toast.error('Something went wrong. Please try again.');
    return;
  }

  const issues = error.fieldErrors;
  if (issues.length > 0) {
    for (const issue of issues) {
      form.setError(issue.path as Path<TFieldValues>, { message: issue.message });
    }
    return;
  }

  if (fallbackField) form.setError(fallbackField, { message: error.message });
  else toast.error(error.message);
}

export function showApiError(error: unknown, fallback = 'Something went wrong. Please try again.'): void {
  toast.error(error instanceof ApiError ? error.message : fallback);
}
