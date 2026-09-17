'use client';

import type { DashboardPeriod, DashboardSummaryDto } from '@spms/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDashboard(period: DashboardPeriod, enabled: boolean) {
  return useQuery({
    queryKey: ['dashboard', period],
    queryFn: () => api.get<DashboardSummaryDto>('/dashboard/summary', { period }),
    placeholderData: keepPreviousData,
    enabled,
    // Figures change as documents are saved anywhere in the app; refresh when the tab regains focus.
    refetchOnWindowFocus: true,
  });
}
