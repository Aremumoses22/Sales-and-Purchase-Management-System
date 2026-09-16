'use client';

import { Loader2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { SessionProvider, useMeQuery } from '@/lib/session';

/** Print views: signed-in, but without the sidebar and top bar. */
export default function PrintLayout({ children }: { children: ReactNode }) {
  const { data: session, isError } = useMeQuery();
  const router = useRouter();

  useEffect(() => {
    if (isError) router.replace('/login');
  }, [isError, router]);

  if (!session) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <SessionProvider session={session}>
      <div className="min-h-svh bg-muted/40 py-6 print:bg-white print:py-0">{children}</div>
    </SessionProvider>
  );
}
