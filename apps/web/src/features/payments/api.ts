'use client';

import type {
  ApplyCreditsInput,
  AuditLogDto,
  AvailableCreditsDto,
  InvoiceDto,
  OpenInvoiceDto,
  Paginated,
  PaymentReceivedDto,
  PaymentReceivedInput,
  PaymentReceivedListItemDto,
  PaymentRefundInput,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const paymentsKey = ['payments-received'] as const;

export function usePayments(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...paymentsKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<PaymentReceivedListItemDto>>('/payments-received', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function usePayment(id: string) {
  return useQuery({ queryKey: [...paymentsKey, id], queryFn: () => api.get<PaymentReceivedDto>(`/payments-received/${id}`) });
}

export function usePaymentHistory(id: string) {
  return useQuery({
    queryKey: [...paymentsKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/payments-received/${id}/history`),
  });
}

export function useOpenInvoices(customerId: string, paymentId?: string) {
  return useQuery({
    queryKey: [...paymentsKey, 'open-invoices', customerId, paymentId ?? null],
    queryFn: () => api.get<OpenInvoiceDto[]>('/payments-received/open-invoices', { customerId, paymentId }),
    enabled: Boolean(customerId),
  });
}

export function useAvailableCredits(invoiceId: string, enabled: boolean) {
  return useQuery({
    queryKey: [...paymentsKey, 'available-credits', invoiceId],
    queryFn: () => api.get<AvailableCreditsDto>(`/invoices/${invoiceId}/available-credits`),
    enabled,
  });
}

/** Payments change invoice balances and what customers owe, so all of those refresh. */
function useInvalidatePayments() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [paymentsKey, ['invoices'], ['customers'], ['items'], ['credit-notes']].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
}

export function useSavePayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: PaymentReceivedInput }) =>
      id
        ? api.put<PaymentReceivedDto>(`/payments-received/${id}`, input)
        : api.post<PaymentReceivedDto>('/payments-received', input),
    onSuccess: () => invalidate(),
  });
}

export function useDeletePayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/payments-received/${id}`),
    onSuccess: () => invalidate(),
  });
}

export function useAddRefund() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PaymentRefundInput }) =>
      api.post<PaymentReceivedDto>(`/payments-received/${id}/refunds`, input),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveRefund() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: ({ id, refundId }: { id: string; refundId: string }) =>
      api.delete<PaymentReceivedDto>(`/payments-received/${id}/refunds/${refundId}`),
    onSuccess: () => invalidate(),
  });
}

export function useApplyCredits() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: ({ invoiceId, input }: { invoiceId: string; input: ApplyCreditsInput }) =>
      api.post<InvoiceDto>(`/invoices/${invoiceId}/apply-credits`, input),
    onSuccess: () => invalidate(),
  });
}
