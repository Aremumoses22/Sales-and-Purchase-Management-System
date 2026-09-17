'use client';

import { cn } from 'cn';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { PageHeader } from '@/components/page-header';
import { useCan } from '@/lib/session';

const SECTIONS = [
  {
    label: 'Organization',
    links: [
      { href: '/settings/organization', label: 'Profile', permission: 'settings:view' as const },
      { href: '/settings/numbering', label: 'Transaction numbering', permission: 'settings:view' as const },
    ],
  },
  {
    label: 'Lists',
    links: [
      { href: '/settings/taxes', label: 'Taxes' },
      { href: '/settings/payment-terms', label: 'Payment terms' },
      { href: '/settings/payment-modes', label: 'Payment modes' },
      { href: '/settings/expense-categories', label: 'Expense categories' },
    ],
  },
  {
    label: 'Access',
    links: [
      { href: '/settings/users', label: 'Users', permission: 'users:manage' as const },
      { href: '/settings/roles', label: 'Roles', permission: 'users:manage' as const },
      { href: '/settings/audit-log', label: 'Audit log', permission: 'audit:view' as const },
      { href: '/settings/profile', label: 'My profile' },
    ],
  },
];

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const can = useCan();

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Company profile, numbering, lists, users, roles and the audit log." />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="w-full shrink-0 space-y-4 lg:w-56">
          {SECTIONS.map((section) => {
            const links = section.links.filter((link) => !link.permission || can(link.permission));
            if (links.length === 0) return null;
            return (
              <div key={section.label} className="space-y-1">
                <p className="px-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  {section.label}
                </p>
                {links.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'block rounded-md px-2 py-1.5 text-sm transition-colors',
                      pathname === link.href
                        ? 'bg-card font-medium shadow-sm ring-1 ring-border'
                        : 'text-muted-foreground hover:bg-card/60 hover:text-foreground',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
