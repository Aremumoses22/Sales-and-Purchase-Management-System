'use client';

import type {
  AuditLogDto,
  ExpenseDto,
  ExpenseInput,
  ExpenseListItemDto,
  ExpenseTotalsDto,
  Paginated,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const expensesKey = ['expenses'] as const;

export function useExpenses(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...expensesKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<ExpenseListItemDto>>('/expenses', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useExpenseTotals(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...expensesKey, 'totals', params],
    queryFn: () => api.get<ExpenseTotalsDto>('/expenses/totals', params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useExpense(id: string) {
  return useQuery({ queryKey: [...expensesKey, id], queryFn: () => api.get<ExpenseDto>(`/expenses/${id}`) });
}

export function useExpenseHistory(id: string) {
  return useQuery({
    queryKey: [...expensesKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/expenses/${id}/history`),
  });
}

function useInvalidateExpenses() {
  const queryClient = useQueryClient();
  return () => Promise.all([expensesKey, ['vendors']].map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

export function useSaveExpense() {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ExpenseInput }) =>
      id ? api.put<ExpenseDto>(`/expenses/${id}`, input) : api.post<ExpenseDto>('/expenses', input),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`),
    onSuccess: () => invalidate(),
  });
}

export function useAttachReceipt() {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<ExpenseDto>(`/expenses/${id}/receipt`, formData);
    },
    onSuccess: () => invalidate(),
  });
}

export function useRemoveReceipt() {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: (id: string) => api.delete<ExpenseDto>(`/expenses/${id}/receipt`),
    onSuccess: () => invalidate(),
  });
}

/** Same-origin URL, so the session cookie authorizes the image or PDF. */
export function receiptUrl(expense: Pick<ExpenseDto, 'id' | 'updatedAt'>) {
  return `/api/v1/expenses/${expense.id}/receipt?v=${encodeURIComponent(expense.updatedAt)}`;
}
