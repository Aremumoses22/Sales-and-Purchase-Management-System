'use client';

import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { SidebarNav } from '@/components/app-shell/sidebar';
import { Topbar } from '@/components/app-shell/topbar';
import { ChangePasswordRequired } from '@/features/auth/change-password-required';
import { SessionProvider, useMeQuery } from '@/lib/session';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { data: session, isPending, isError } = useMeQuery();
  const router = useRouter();

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (isPending || !session) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SessionProvider session={session}>
      {session.user.mustChangePassword ? (
        <ChangePasswordRequired />
      ) : (
        <div className="flex min-h-svh">
          <aside className="hidden w-60 shrink-0 lg:block">
            <div className="fixed inset-y-0 w-60">
              <SidebarNav />
            </div>
          </aside>
          <div className="flex min-w-0 flex-1 flex-col bg-muted/30">
            <Topbar />
            <main className="flex-1 p-4 sm:p-6">
              <Suspense
                fallback={
                  <div className="flex h-64 items-center justify-center">
                    <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
                  </div>
                }
              >
                {children}
              </Suspense>
            </main>
          </div>
        </div>
      )}
    </SessionProvider>
  );
}
