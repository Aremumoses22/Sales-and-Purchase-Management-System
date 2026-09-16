'use client';

import type {
  ApplyCreditNoteInput,
  AuditLogDto,
  CreditNoteDto,
  CreditNoteInput,
  CreditNoteListItemDto,
  OpenInvoiceDto,
  Paginated,
  PaymentRefundInput,
  StatusCountsDto,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const creditNotesKey = ['credit-notes'] as const;

export function useCreditNotes(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...creditNotesKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<CreditNoteListItemDto>>('/credit-notes', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCreditNoteStatusCounts(params: Record<string, string | number>) {
  return useQuery({
    queryKey: [...creditNotesKey, 'counts', params],
    queryFn: () => api.get<StatusCountsDto>('/credit-notes/status-counts', params),
    placeholderData: keepPreviousData,
  });
}

export function useCreditNote(id: string) {
  return useQuery({ queryKey: [...creditNotesKey, id], queryFn: () => api.get<CreditNoteDto>(`/credit-notes/${id}`) });
}

export function useCreditNoteHistory(id: string) {
  return useQuery({
    queryKey: [...creditNotesKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/credit-notes/${id}/history`),
  });
}

export function useCreditNoteOpenInvoices(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...creditNotesKey, id, 'open-invoices'],
    queryFn: () => api.get<OpenInvoiceDto[]>(`/credit-notes/${id}/open-invoices`),
    enabled,
  });
}

/** Credit notes change invoice balances, customer credits and stock, so all of those refresh. */
function useInvalidateCreditNotes() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      [creditNotesKey, ['invoices'], ['customers'], ['items'], ['payments-received']].map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
}

export function useSaveCreditNote() {
  const invalidate = useInvalidateCreditNotes();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreditNoteInput }) =>
      id ? api.put<CreditNoteDto>(`/credit-notes/${id}`, input) : api.post<CreditNoteDto>('/credit-notes', input),
    onSuccess: () => invalidate(),
  });
}

export function useMarkCreditNoteOpen() {
  const invalidate = useInvalidateCreditNotes();
  return useMutation({
    mutationFn: (id: string) => api.post<CreditNoteDto>(`/credit-notes/${id}/mark-open`),
    onSuccess: () => invalidate(),
  });
}

export function useVoidCreditNote() {
  const invalidate = useInvalidateCreditNotes();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post<CreditNoteDto>(`/credit-notes/${id}/void`, { reason }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteCreditNote() {
  const invalidate = useInvalidateCreditNotes();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/credit-notes/${id}`),
    onSuccess: () => invalidate(),
  });
}

export function useApplyCreditNote() {
  const invalidate = useInvalidateCreditNotes();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ApplyCreditNoteInput }) =>
      api.post<CreditNoteDto>(`/credit-notes/${id}/apply`, input),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveCreditApplication() {
  const invalidate = useInvalidateCreditNotes();
  return useMutation({
    mutationFn: ({ id, applicationId }: { id: string; applicationId: string }) =>
      api.delete<CreditNoteDto>(`/credit-notes/${id}/applications/${applicationId}`),
    onSuccess: () => invalidate(),
  });
}

export function useAddCreditNoteRefund() {
  const invalidate = useInvalidateCreditNotes();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PaymentRefundInput }) =>
      api.post<CreditNoteDto>(`/credit-notes/${id}/refunds`, input),
    onSuccess: () => invalidate(),
  });
}

export function useRemoveCreditNoteRefund() {
  const invalidate = useInvalidateCreditNotes();
  return useMutation({
    mutationFn: ({ id, refundId }: { id: string; refundId: string }) =>
      api.delete<CreditNoteDto>(`/credit-notes/${id}/refunds/${refundId}`),
    onSuccess: () => invalidate(),
  });
}
