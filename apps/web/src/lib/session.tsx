'use client';

import type { MeDto, Permission } from '@spms/shared';
import { useQuery } from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { api } from './api';

export const SESSION_QUERY_KEY = ['auth', 'me'] as const;

export function useMeQuery() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: () => api.get<MeDto>('/auth/me'),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

const SessionContext = createContext<MeDto | null>(null);

export function SessionProvider({ session, children }: { session: MeDto; children: ReactNode }) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useSession(): MeDto {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}

export function useOrganization() {
  return useSession().organization;
}

/** `can('quotes:create')` — true only when the signed-in user has every listed permission. */
export function useCan(): (...permissions: Permission[]) => boolean {
  const { user } = useSession();
  return useMemo(() => {
    const granted = new Set<string>(user.permissions);
    return (...permissions: Permission[]) => permissions.every((permission) => granted.has(permission));
  }, [user.permissions]);
}
