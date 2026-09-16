'use client';

import { Loader2Icon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { ContactForm } from '@/features/contacts/contact-form';
import { useVendor } from '@/features/vendors/api';

export default function EditVendorPage() {
  const { id } = useParams<{ id: string }>();
  const { data: vendor, isPending, isError } = useVendor(id);

  if (isError) return <p className="text-sm text-muted-foreground">This vendor could not be loaded.</p>;
  if (isPending) return <Loader2Icon className="mx-auto mt-16 size-6 animate-spin text-muted-foreground" />;

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <PageHeader title={`Edit ${vendor.displayName}`} />
      <ContactForm type="vendor" contact={vendor} />
    </div>
  );
}
