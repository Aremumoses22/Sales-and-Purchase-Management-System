'use client';

import { contactQuery, contactsKey, useContact, useContacts } from '@/features/contacts/api';

export const vendorsKey = contactsKey('vendor');
export const vendorQuery = (id: string) => contactQuery('vendor', id);
export const useVendors = (params: Record<string, string | number>, enabled = true) => useContacts('vendor', params, enabled);
export const useVendor = (id: string, enabled = true) => useContact('vendor', id, enabled);
