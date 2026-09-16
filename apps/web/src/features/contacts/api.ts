'use client';

import type {
  AuditLogDto,
  ContactDto,
  ContactInput,
  ContactListItemDto,
  ContactSummaryDto,
  ContactType,
  Paginated,
  VendorSummaryDto,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

/** URL segment and cache key for each kind of contact. */
export const CONTACT_RESOURCES = { customer: 'customers', vendor: 'vendors' } as const satisfies Record<ContactType, string>;

export const CONTACT_LABELS = {
  customer: { one: 'Customer', many: 'Customers', lower: 'customer' },
  vendor: { one: 'Vendor', many: 'Vendors', lower: 'vendor' },
} as const satisfies Record<ContactType, { one: string; many: string; lower: string }>;

export interface ContactSummaries {
  customer: ContactSummaryDto;
  vendor: VendorSummaryDto;
}

export function contactsKey(type: ContactType) {
  return [CONTACT_RESOURCES[type]] as const;
}

export function useContacts(type: ContactType, params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...contactsKey(type), 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<ContactListItemDto>>(`/${CONTACT_RESOURCES[type]}`, params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Shared so forms can fetch a contact imperatively and still hit the same cache entry. */
export const contactQuery = (type: ContactType, id: string) => ({
  queryKey: [...contactsKey(type), id] as const,
  queryFn: () => api.get<ContactDto>(`/${CONTACT_RESOURCES[type]}/${id}`),
});

export function useContact(type: ContactType, id: string, enabled = true) {
  return useQuery({ ...contactQuery(type, id), enabled: enabled && Boolean(id) });
}

export function useContactSummary<T extends ContactType>(type: T, id: string) {
  return useQuery({
    queryKey: [...contactsKey(type), id, 'summary'],
    queryFn: () => api.get<ContactSummaries[T]>(`/${CONTACT_RESOURCES[type]}/${id}/summary`),
  });
}

export function useContactHistory(type: ContactType, id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...contactsKey(type), id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/${CONTACT_RESOURCES[type]}/${id}/history`),
    enabled,
  });
}

export function useSaveContact(type: ContactType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ContactInput }) =>
      id
        ? api.put<ContactDto>(`/${CONTACT_RESOURCES[type]}/${id}`, input)
        : api.post<ContactDto>(`/${CONTACT_RESOURCES[type]}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactsKey(type) });
    },
  });
}

export function useSetContactActive(type: ContactType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post<ContactDto>(`/${CONTACT_RESOURCES[type]}/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactsKey(type) });
    },
  });
}

export function useDeleteContact(type: ContactType) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/${CONTACT_RESOURCES[type]}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactsKey(type) });
    },
  });
}
