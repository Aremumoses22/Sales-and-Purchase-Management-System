'use client';

import { useParams } from 'next/navigation';
import { ContactDetailPage } from '@/features/contacts/contact-detail-page';
import { VendorBills, VendorExpenses, VendorPaymentsMade } from '@/features/vendors/vendor-transactions';

export default function VendorDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <ContactDetailPage
      type="vendor"
      id={id}
      newTransactions={[
        { href: '/bills/new', label: 'Bill', permission: 'bills:create' },
        { href: '/payments-made/new', label: 'Payment made', permission: 'payments_made:create' },
        { href: '/expenses/new', label: 'Expense', permission: 'expenses:create' },
      ]}
      transactions={
        <>
          <VendorBills vendorId={id} />
          <VendorPaymentsMade vendorId={id} />
          <VendorExpenses vendorId={id} />
        </>
      }
    />
  );
}
