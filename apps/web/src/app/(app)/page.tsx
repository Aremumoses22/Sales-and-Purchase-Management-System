'use client';

import { ArrowRightIcon, FileTextIcon, PackageIcon, ReceiptIcon, UsersIcon } from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCan, useSession } from '@/lib/session';

const SHORTCUTS = [
  {
    href: '/customers',
    label: 'Customers',
    description: 'Register customers, keep their details and see what they owe.',
    icon: UsersIcon,
    permission: 'customers:view' as const,
  },
  {
    href: '/items',
    label: 'Items',
    description: 'Products and services with prices, taxes and stock levels.',
    icon: PackageIcon,
    permission: 'items:view' as const,
  },
  {
    href: '/invoices',
    label: 'Invoices',
    description: 'Bill customers, track what is owed and see what is overdue.',
    icon: ReceiptIcon,
    permission: 'invoices:view' as const,
  },
  {
    href: '/quotes',
    label: 'Quotes',
    description: 'Quote customers, then accept or decline and convert to invoices.',
    icon: FileTextIcon,
    permission: 'quotes:view' as const,
  },
];

export default function HomePage() {
  const { user } = useSession();
  const can = useCan();
  const shortcuts = SHORTCUTS.filter((shortcut) => can(shortcut.permission));

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        description="The dashboard with receivables, sales and expense charts arrives with Module 12."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shortcuts.map((shortcut) => (
          <Card key={shortcut.href}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <shortcut.icon className="size-4 text-muted-foreground" />
                {shortcut.label}
              </CardTitle>
              <CardDescription>{shortcut.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" size="sm" nativeButton={false} render={<Link href={shortcut.href} />}>
                Open
                <ArrowRightIcon />
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
