'use client';

import type {
  AuditLogDto,
  ContactDto,
  ContactInput,
  ContactListItemDto,
  ContactSummaryDto,
  Paginated,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const customersKey = ['customers'] as const;

export function useCustomers(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...customersKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<ContactListItemDto>>('/customers', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCustomer(id: string, enabled = true) {
  return useQuery({
    queryKey: [...customersKey, id],
    queryFn: () => api.get<ContactDto>(`/customers/${id}`),
    enabled: enabled && Boolean(id),
  });
}

export function useCustomerSummary(id: string) {
  return useQuery({
    queryKey: [...customersKey, id, 'summary'],
    queryFn: () => api.get<ContactSummaryDto>(`/customers/${id}/summary`),
  });
}

export function useCustomerHistory(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...customersKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/customers/${id}/history`),
    enabled,
  });
}

export function useSaveCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ContactInput }) =>
      id ? api.put<ContactDto>(`/customers/${id}`, input) : api.post<ContactDto>('/customers', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customersKey });
    },
  });
}

export function useSetCustomerActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post<ContactDto>(`/customers/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customersKey });
    },
  });
}

export function useDeleteCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/customers/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: customersKey });
    },
  });
}
