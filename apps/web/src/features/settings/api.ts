'use client';

import type {
  DocumentType,
  ExpenseCategoryDto,
  ExpenseCategoryInput,
  NumberSeriesDto,
  NumberSeriesInput,
  OrganizationDto,
  OrganizationInput,
  PaymentModeDto,
  PaymentModeInput,
  PaymentTermDto,
  PaymentTermInput,
  RoleDto,
  RoleInput,
  TaxDto,
  TaxInput,
  UserDto,
} from '@spms/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { SESSION_QUERY_KEY } from '@/lib/session';

// ---------- Organization ----------

export const organizationKey = ['settings', 'organization'] as const;

export function useOrganizationQuery() {
  return useQuery({ queryKey: organizationKey, queryFn: () => api.get<OrganizationDto>('/settings/organization') });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: OrganizationInput) => api.put<OrganizationDto>('/settings/organization', input),
    onSuccess: (organization) => {
      queryClient.setQueryData(organizationKey, organization);
      // The session carries the organization for currency and date formatting.
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useUploadLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return api.upload<OrganizationDto>('/settings/organization/logo', formData);
    },
    onSuccess: (organization) => {
      queryClient.setQueryData(organizationKey, organization);
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

export function useRemoveLogo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete('/settings/organization/logo'),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: organizationKey });
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });
}

// ---------- Document numbering ----------

export const numberSeriesKey = ['settings', 'number-series'] as const;

export function useNumberSeriesQuery() {
  return useQuery({ queryKey: numberSeriesKey, queryFn: () => api.get<NumberSeriesDto[]>('/settings/number-series') });
}

export function useNumberSeriesFor(documentType: DocumentType, enabled = true) {
  return useQuery({
    queryKey: [...numberSeriesKey, documentType],
    queryFn: () => api.get<NumberSeriesDto>(`/settings/number-series/${documentType}`),
    enabled,
    staleTime: 60_000,
  });
}

export function useUpdateNumberSeries() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentType, input }: { documentType: DocumentType; input: NumberSeriesInput }) =>
      api.put<NumberSeriesDto>(`/settings/number-series/${documentType}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: numberSeriesKey });
    },
  });
}

// ---------- Settings lists ----------

export type LookupPath = 'taxes' | 'payment-terms' | 'payment-modes' | 'expense-categories';

export type LookupDto<P extends LookupPath> = P extends 'taxes'
  ? TaxDto
  : P extends 'payment-terms'
    ? PaymentTermDto
    : P extends 'payment-modes'
      ? PaymentModeDto
      : ExpenseCategoryDto;

export type LookupInput<P extends LookupPath> = P extends 'taxes'
  ? TaxInput
  : P extends 'payment-terms'
    ? PaymentTermInput
    : P extends 'payment-modes'
      ? PaymentModeInput
      : ExpenseCategoryInput;

export const lookupKey = (path: LookupPath, includeInactive = false) =>
  ['settings', path, { includeInactive }] as const;

export function useLookupQuery<P extends LookupPath>(path: P, includeInactive = false) {
  return useQuery({
    queryKey: lookupKey(path, includeInactive),
    queryFn: () =>
      api.get<LookupDto<P>[]>(`/settings/${path}`, includeInactive ? { includeInactive: 'true' } : undefined),
    staleTime: 60_000,
  });
}

export function useSaveLookup<P extends LookupPath>(path: P) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: LookupInput<P> }) =>
      id ? api.put<LookupDto<P>>(`/settings/${path}/${id}`, input) : api.post<LookupDto<P>>(`/settings/${path}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', path] });
    },
  });
}

export function useDeleteLookup(path: LookupPath) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/settings/${path}/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['settings', path] });
    },
  });
}

// ---------- Users and roles ----------

export const usersKey = ['users'] as const;
export const rolesKey = ['roles'] as const;

export function useUsersQuery() {
  return useQuery({ queryKey: usersKey, queryFn: () => api.get<UserDto[]>('/users') });
}

export function useRolesQuery(enabled = true) {
  return useQuery({ queryKey: rolesKey, queryFn: () => api.get<RoleDto[]>('/roles'), enabled, staleTime: 60_000 });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; email: string; roleId: string; password: string }) =>
      api.post<UserDto>('/users', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKey });
      void queryClient.invalidateQueries({ queryKey: rolesKey });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name: string; roleId: string; isActive: boolean } }) =>
      api.put<UserDto>(`/users/${id}`, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKey });
      void queryClient.invalidateQueries({ queryKey: rolesKey });
    },
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) =>
      api.post<void>(`/users/${id}/reset-password`, { password }),
  });
}

export function useSaveRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: RoleInput }) =>
      id ? api.put<RoleDto>(`/roles/${id}`, input) : api.post<RoleDto>('/roles', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rolesKey });
    },
  });
}

export function useDeleteRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: rolesKey });
    },
  });
}
