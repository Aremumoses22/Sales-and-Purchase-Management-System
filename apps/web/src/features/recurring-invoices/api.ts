'use client';

import type {
  AuditLogDto,
  RecurringRunResultDto,
  InvoiceDto,
  Paginated,
  RecurringInvoiceDto,
  RecurringInvoiceInput,
  RecurringInvoiceListItemDto,
  StatusCountsDto,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const recurringInvoicesKey = ['recurring-invoices'] as const;

export function useRecurringInvoices(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...recurringInvoicesKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<RecurringInvoiceListItemDto>>('/recurring-invoices', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useRecurringInvoiceStatusCounts(params: Record<string, string | number>) {
  return useQuery({
    queryKey: [...recurringInvoicesKey, 'counts', params],
    queryFn: () => api.get<StatusCountsDto>('/recurring-invoices/status-counts', params),
    placeholderData: keepPreviousData,
  });
}

export function useRecurringInvoice(id: string) {
  return useQuery({
    queryKey: [...recurringInvoicesKey, id],
    queryFn: () => api.get<RecurringInvoiceDto>(`/recurring-invoices/${id}`),
  });
}

export function useRecurringInvoiceHistory(id: string) {
  return useQuery({
    queryKey: [...recurringInvoicesKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/recurring-invoices/${id}/history`),
  });
}

function useInvalidateRecurringInvoices() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [recurringInvoicesKey, ['invoices'], ['customers'], ['items']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function useSaveRecurringInvoice() {
  const invalidate = useInvalidateRecurringInvoices();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RecurringInvoiceInput }) =>
      id ? api.put<RecurringInvoiceDto>(`/recurring-invoices/${id}`, input) : api.post<RecurringInvoiceDto>('/recurring-invoices', input),
    onSuccess: () => invalidate(),
  });
}

export function useStopRecurringInvoice() {
  const invalidate = useInvalidateRecurringInvoices();
  return useMutation({
    mutationFn: (id: string) => api.post<RecurringInvoiceDto>(`/recurring-invoices/${id}/stop`),
    onSuccess: () => invalidate(),
  });
}

export function useResumeRecurringInvoice() {
  const invalidate = useInvalidateRecurringInvoices();
  return useMutation({
    mutationFn: (id: string) => api.post<RecurringInvoiceDto>(`/recurring-invoices/${id}/resume`),
    onSuccess: () => invalidate(),
  });
}

export function useCreateInvoiceNow() {
  const invalidate = useInvalidateRecurringInvoices();
  return useMutation({
    mutationFn: (id: string) => api.post<InvoiceDto>(`/recurring-invoices/${id}/create-invoice`),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteRecurringInvoice() {
  const invalidate = useInvalidateRecurringInvoices();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/recurring-invoices/${id}`),
    onSuccess: () => invalidate(),
  });
}

export function useRunDueRecurringInvoices() {
  const invalidate = useInvalidateRecurringInvoices();
  return useMutation({
    mutationFn: () => api.post<RecurringRunResultDto>('/recurring-invoices/run-due'),
    onSuccess: () => invalidate(),
  });
}
