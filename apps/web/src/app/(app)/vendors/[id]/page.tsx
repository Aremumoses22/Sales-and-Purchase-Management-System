'use client';

import { useParams } from 'next/navigation';
import { ContactDetailPage } from '@/features/contacts/contact-detail-page';
import { VendorExpenses } from '@/features/vendors/vendor-transactions';

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ContactDetailPage
      type="vendor"
      id={id}
      newTransactions={[{ href: '/expenses/new', label: 'Expense', permission: 'expenses:create' }]}
      transactions={<VendorExpenses vendorId={id} />}
    />
  );
}
