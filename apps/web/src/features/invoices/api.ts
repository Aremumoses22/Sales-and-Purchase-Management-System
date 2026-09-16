'use client';

import type {
  AuditLogDto,
  InvoiceDto,
  InvoiceInput,
  InvoiceListItemDto,
  Paginated,
  StatusCountsDto,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const invoicesKey = ['invoices'] as const;

export function useInvoices(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...invoicesKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<InvoiceListItemDto>>('/invoices', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useInvoiceStatusCounts(params: Record<string, string | number>) {
  return useQuery({
    queryKey: [...invoicesKey, 'counts', params],
    queryFn: () => api.get<StatusCountsDto>('/invoices/status-counts', params),
    placeholderData: keepPreviousData,
  });
}

export function useInvoice(id: string) {
  return useQuery({ queryKey: [...invoicesKey, id], queryFn: () => api.get<InvoiceDto>(`/invoices/${id}`) });
}

export function useInvoiceHistory(id: string) {
  return useQuery({
    queryKey: [...invoicesKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/invoices/${id}/history`),
  });
}

/** Invoices change what customers owe, stock on hand and quote status, so all of those refresh. */
function useInvalidateInvoices() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [invoicesKey, ['customers'], ['items'], ['quotes']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function useSaveInvoice() {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: InvoiceInput }) =>
      id ? api.put<InvoiceDto>(`/invoices/${id}`, input) : api.post<InvoiceDto>('/invoices', input),
    onSuccess: () => invalidate(),
  });
}

export function useMarkInvoiceSent() {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: (id: string) => api.post<InvoiceDto>(`/invoices/${id}/mark-sent`),
    onSuccess: () => invalidate(),
  });
}

export function useVoidInvoice() {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post<InvoiceDto>(`/invoices/${id}/void`, { reason }),
    onSuccess: () => invalidate(),
  });
}

export function useCloneInvoice() {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: (id: string) => api.post<InvoiceDto>(`/invoices/${id}/clone`),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteInvoice() {
  const invalidate = useInvalidateInvoices();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/invoices/${id}`),
    onSuccess: () => invalidate(),
  });
}
