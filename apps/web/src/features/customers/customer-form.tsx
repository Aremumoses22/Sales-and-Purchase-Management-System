'use client';

import type { ContactDto } from '@spms/shared';
import { ContactForm } from '@/features/contacts/contact-form';

export function CustomerForm({ customer }: { customer?: ContactDto }) {
  return <ContactForm type="customer" contact={customer} />;
}
