'use client';

import {
  contactQuery,
  contactsKey,
  useContact,
  useContacts,
  useContactHistory,
  useContactSummary,
  useDeleteContact,
  useSaveContact,
  useSetContactActive,
} from '@/features/contacts/api';

export const customersKey = contactsKey('customer');
export const customerQuery = (id: string) => contactQuery('customer', id);
export const useCustomers = (params: Record<string, string | number>, enabled = true) => useContacts('customer', params, enabled);
export const useCustomer = (id: string, enabled = true) => useContact('customer', id, enabled);
export const useCustomerSummary = (id: string) => useContactSummary('customer', id);
export const useCustomerHistory = (id: string, enabled: boolean) => useContactHistory('customer', id, enabled);
export const useSaveCustomer = () => useSaveContact('customer');
export const useSetCustomerActive = () => useSetContactActive('customer');
export const useDeleteCustomer = () => useDeleteContact('customer');
