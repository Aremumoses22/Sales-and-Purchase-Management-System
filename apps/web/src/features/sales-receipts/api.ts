'use client';

import type {
  AuditLogDto,
  Paginated,
  SalesReceiptDto,
  SalesReceiptInput,
  SalesReceiptListItemDto,
  StatusCountsDto,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const salesReceiptsKey = ['sales-receipts'] as const;

export function useSalesReceipts(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...salesReceiptsKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<SalesReceiptListItemDto>>('/sales-receipts', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useSalesReceiptStatusCounts(params: Record<string, string | number>) {
  return useQuery({
    queryKey: [...salesReceiptsKey, 'counts', params],
    queryFn: () => api.get<StatusCountsDto>('/sales-receipts/status-counts', params),
    placeholderData: keepPreviousData,
  });
}

export function useSalesReceipt(id: string) {
  return useQuery({ queryKey: [...salesReceiptsKey, id], queryFn: () => api.get<SalesReceiptDto>(`/sales-receipts/${id}`) });
}

export function useSalesReceiptHistory(id: string) {
  return useQuery({
    queryKey: [...salesReceiptsKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/sales-receipts/${id}/history`),
  });
}

/** Receipts change stock on hand, so items refresh as well. */
function useInvalidateSalesReceipts() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([salesReceiptsKey, ['items'], ['customers']].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useSaveSalesReceipt() {
  const invalidate = useInvalidateSalesReceipts();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: SalesReceiptInput }) =>
      id ? api.put<SalesReceiptDto>(`/sales-receipts/${id}`, input) : api.post<SalesReceiptDto>('/sales-receipts', input),
    onSuccess: () => invalidate(),
  });
}

export function useCompleteSalesReceipt() {
  const invalidate = useInvalidateSalesReceipts();
  return useMutation({
    mutationFn: (id: string) => api.post<SalesReceiptDto>(`/sales-receipts/${id}/complete`),
    onSuccess: () => invalidate(),
  });
}

export function useVoidSalesReceipt() {
  const invalidate = useInvalidateSalesReceipts();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<SalesReceiptDto>(`/sales-receipts/${id}/void`, { reason }),
    onSuccess: () => invalidate(),
  });
}

export function useCloneSalesReceipt() {
  const invalidate = useInvalidateSalesReceipts();
  return useMutation({
    mutationFn: (id: string) => api.post<SalesReceiptDto>(`/sales-receipts/${id}/clone`),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteSalesReceipt() {
  const invalidate = useInvalidateSalesReceipts();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/sales-receipts/${id}`),
    onSuccess: () => invalidate(),
  });
}
