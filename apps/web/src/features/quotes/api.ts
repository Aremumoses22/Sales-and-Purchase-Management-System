'use client';

import type {
  AuditLogDto,
  Paginated,
  QuoteDto,
  QuoteInput,
  QuoteListItemDto,
  StatusCountsDto,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const quotesKey = ['quotes'] as const;

export function useQuotes(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...quotesKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<QuoteListItemDto>>('/quotes', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useQuoteStatusCounts(params: Record<string, string | number>) {
  return useQuery({
    queryKey: [...quotesKey, 'counts', params],
    queryFn: () => api.get<StatusCountsDto>('/quotes/status-counts', params),
    placeholderData: keepPreviousData,
  });
}

export function useQuote(id: string) {
  return useQuery({
    queryKey: [...quotesKey, id],
    queryFn: () => api.get<QuoteDto>(`/quotes/${id}`),
  });
}

export function useQuoteHistory(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...quotesKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/quotes/${id}/history`),
    enabled,
  });
}

function useInvalidateQuotes() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: quotesKey });
}

export function useSaveQuote() {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: QuoteInput }) =>
      id ? api.put<QuoteDto>(`/quotes/${id}`, input) : api.post<QuoteDto>('/quotes', input),
    onSuccess: () => invalidate(),
  });
}

export type QuoteTransition = 'mark-sent' | 'accept' | 'decline';

export function useQuoteTransition() {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: QuoteTransition }) =>
      api.post<QuoteDto>(`/quotes/${id}/${action}`),
    onSuccess: () => invalidate(),
  });
}

export function useCloneQuote() {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: (id: string) => api.post<QuoteDto>(`/quotes/${id}/clone`),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteQuote() {
  const invalidate = useInvalidateQuotes();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/quotes/${id}`),
    onSuccess: () => invalidate(),
  });
}
