'use client';

import { PackageIcon } from 'lucide-react';
import { useParams } from 'next/navigation';
import { EmptyState } from '@/components/empty-state';
import { ContactDetailPage } from '@/features/contacts/contact-detail-page';

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ContactDetailPage
      type="vendor"
      id={id}
      newTransactions={[]}
      transactions={<EmptyState icon={<PackageIcon className="size-7" />} title="No transactions with this vendor yet" />}
    />
  );
}
