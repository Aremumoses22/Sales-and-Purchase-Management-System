'use client';

import type {
  AuditLogDto,
  BillDto,
  BillInput,
  BillListItemDto,
  OpenBillDto,
  Paginated,
  PaymentMadeDto,
  PaymentMadeInput,
  PaymentMadeListItemDto,
  StatusCountsDto,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const billsKey = ['bills'] as const;
export const paymentsMadeKey = ['payments-made'] as const;

/** Bills and payments made change each other, vendor payables and stock, so all of those refresh. */
function useInvalidatePurchases() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([billsKey, paymentsMadeKey, ['vendors'], ['items']].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useBills(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...billsKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<BillListItemDto>>('/bills', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useBillStatusCounts(params: Record<string, string | number>) {
  return useQuery({
    queryKey: [...billsKey, 'counts', params],
    queryFn: () => api.get<StatusCountsDto>('/bills/status-counts', params),
    placeholderData: keepPreviousData,
  });
}

export function useBill(id: string) {
  return useQuery({ queryKey: [...billsKey, id], queryFn: () => api.get<BillDto>(`/bills/${id}`) });
}

export function useBillHistory(id: string) {
  return useQuery({ queryKey: [...billsKey, id, 'history'], queryFn: () => api.get<AuditLogDto[]>(`/bills/${id}/history`) });
}

export function useSaveBill() {
  const invalidate = useInvalidatePurchases();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: BillInput }) =>
      id ? api.put<BillDto>(`/bills/${id}`, input) : api.post<BillDto>('/bills', input),
    onSuccess: () => invalidate(),
  });
}

export function useMarkBillOpen() {
  const invalidate = useInvalidatePurchases();
  return useMutation({ mutationFn: (id: string) => api.post<BillDto>(`/bills/${id}/mark-open`), onSuccess: () => invalidate() });
}

export function useVoidBill() {
  const invalidate = useInvalidatePurchases();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<BillDto>(`/bills/${id}/void`, { reason }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteBill() {
  const invalidate = useInvalidatePurchases();
  return useMutation({ mutationFn: (id: string) => api.delete(`/bills/${id}`), onSuccess: () => invalidate() });
}

export function usePaymentsMade(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...paymentsMadeKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<PaymentMadeListItemDto>>('/payments-made', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePaymentMade(id: string) {
  return useQuery({ queryKey: [...paymentsMadeKey, id], queryFn: () => api.get<PaymentMadeDto>(`/payments-made/${id}`) });
}

export function usePaymentMadeHistory(id: string) {
  return useQuery({
    queryKey: [...paymentsMadeKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/payments-made/${id}/history`),
  });
}

export function useOpenBills(vendorId: string, paymentId?: string) {
  return useQuery({
    queryKey: [...paymentsMadeKey, 'open-bills', vendorId, paymentId ?? null],
    queryFn: () => api.get<OpenBillDto[]>('/payments-made/open-bills', { vendorId, paymentId }),
    enabled: Boolean(vendorId),
  });
}

export function useSavePaymentMade() {
  const invalidate = useInvalidatePurchases();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PaymentMadeInput }) =>
      id ? api.put<PaymentMadeDto>(`/payments-made/${id}`, input) : api.post<PaymentMadeDto>('/payments-made', input),
    onSuccess: () => invalidate(),
  });
}

export function useDeletePaymentMade() {
  const invalidate = useInvalidatePurchases();
  return useMutation({ mutationFn: (id: string) => api.delete(`/payments-made/${id}`), onSuccess: () => invalidate() });
}
