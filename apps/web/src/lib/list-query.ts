'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';

export interface ListQueryState {
  q: string;
  status: string;
  page: number;
  pageSize: number;
  sort: string;
  [key: string]: string | number;
}

export interface ListQueryOptions {
  defaultStatus?: string;
  defaultSort?: string;
  pageSize?: number;
  /** Extra filters kept in the URL, e.g. customerId or type. */
  extraKeys?: string[];
}

/**
 * Keeps list filters, sorting and paging in the URL so a filtered view can be
 * bookmarked, shared and restored by the back button.
 */
export function useListQuery(options: ListQueryOptions = {}) {
  const { defaultStatus = 'all', defaultSort = '', pageSize = 25, extraKeys = [] } = options;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const state = useMemo<ListQueryState>(() => {
    const extras: Record<string, string> = {};
    for (const key of extraKeys) extras[key] = searchParams.get(key) ?? '';
    return {
      q: searchParams.get('q') ?? '',
      status: searchParams.get('status') ?? defaultStatus,
      page: Number(searchParams.get('page') ?? '1') || 1,
      pageSize: Number(searchParams.get('pageSize') ?? pageSize) || pageSize,
      sort: searchParams.get('sort') ?? defaultSort,
      ...extras,
    };
  }, [searchParams, defaultStatus, defaultSort, pageSize, extraKeys]);

  const update = useCallback(
    (changes: Record<string, string | number | undefined>, { resetPage = true } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === '' || value === null) next.delete(key);
        else next.set(key, String(value));
      }
      if (resetPage && !('page' in changes)) next.delete('page');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  /** Only the parameters the API understands, with blanks removed. */
  const params = useMemo(() => {
    const result: Record<string, string | number> = { page: state.page, pageSize: state.pageSize };
    if (state.q) result['q'] = state.q;
    if (state.status && state.status !== 'all') result['status'] = state.status;
    if (state.status === 'all' && defaultStatus === 'all') result['status'] = 'all';
    if (state.sort) result['sort'] = state.sort;
    for (const key of extraKeys) if (state[key]) result[key] = state[key];
    return result;
  }, [state, defaultStatus, extraKeys]);

  const toggleSort = useCallback(
    (field: string) => {
      const current = state.sort;
      update({ sort: current === field ? `-${field}` : current === `-${field}` ? '' : field });
    },
    [state.sort, update],
  );

  return { state, params, update, toggleSort };
}
