'use client';

import { PageHeader } from '@/components/page-header';
import { ContactForm } from '@/features/contacts/contact-form';

export default function NewVendorPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title="New vendor" />
      <ContactForm type="vendor" />
    </div>
  );
}
