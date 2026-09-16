'use client';

import { cn } from 'cn';
import { SettingsIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCan, useOrganization } from '@/lib/session';
import { NAV_GROUPS, type NavItem } from './nav';

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate?: () => void }) {
  const className = cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
    isActive(pathname, item.href)
      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
  );

  if (item.soon) {
    return (
      <span className={cn(className, 'cursor-default text-sidebar-foreground/35 hover:bg-transparent')} title="Coming in a later module">
        <item.icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
        <span className="ml-auto rounded bg-sidebar-accent/50 px-1 text-[10px] tracking-wide uppercase">soon</span>
      </span>
    );
  }

  return (
    <Link href={item.href} className={className} onClick={onNavigate}>
      <item.icon className="size-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const can = useCan();
  const organization = useOrganization();

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary text-xs font-bold text-sidebar-primary-foreground">
          {organization.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="truncate text-sm font-semibold">{organization.name}</span>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
        {NAV_GROUPS.map((group, index) => {
          const items = group.items.filter((item) => !item.permission || can(item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.label ?? index} className="space-y-0.5">
              {group.label ? (
                <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wider text-sidebar-foreground/40 uppercase">
                  {group.label}
                </p>
              ) : null}
              {items.map((item) => (
                <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
              ))}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <NavLink
          item={{ href: '/settings', label: 'Settings', icon: SettingsIcon }}
          pathname={pathname}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}
