'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { ApiError } from '@/lib/api';

let browserQueryClient: QueryClient | undefined;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Retrying a rejected request only delays the error the user needs to see.
        retry: (failureCount, error) => !(error instanceof ApiError) && failureCount < 2,
      },
    },
  });
}

function getQueryClient() {
  if (typeof window === 'undefined') return createQueryClient();
  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={getQueryClient()}>
      {children}
      {/* Bottom-right, so notifications never cover the action buttons in page headers. */}
      <Toaster position="bottom-right" richColors />
    </QueryClientProvider>
  );
}
