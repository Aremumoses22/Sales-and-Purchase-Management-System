'use client';

import type {
  AuditLogDto,
  ItemDto,
  ItemInput,
  ItemListItemDto,
  Paginated,
  StockAdjustmentInput,
  StockMovementDto,
} from '@spms/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export const itemsKey = ['items'] as const;

export function useItems(params: Record<string, string | number>, enabled = true) {
  return useQuery({
    queryKey: [...itemsKey, 'list', params],
    queryFn: ({ signal }) => api.get<Paginated<ItemListItemDto>>('/items', params, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useItem(id: string) {
  return useQuery({ queryKey: [...itemsKey, id], queryFn: () => api.get<ItemDto>(`/items/${id}`) });
}

export function useItemStockMovements(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...itemsKey, id, 'stock-movements'],
    queryFn: () => api.get<StockMovementDto[]>(`/items/${id}/stock-movements`),
    enabled,
  });
}

export function useItemHistory(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [...itemsKey, id, 'history'],
    queryFn: () => api.get<AuditLogDto[]>(`/items/${id}/history`),
    enabled,
  });
}

function useInvalidateItems() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: itemsKey });
}

export function useSaveItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ItemInput }) =>
      id ? api.put<ItemDto>(`/items/${id}`, input) : api.post<ItemDto>('/items', input),
    onSuccess: () => invalidate(),
  });
}

export function useSetItemActive() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.post<ItemDto>(`/items/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/items/${id}`),
    onSuccess: () => invalidate(),
  });
}

export function useAdjustStock() {
  const invalidate = useInvalidateItems();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: StockAdjustmentInput }) =>
      api.post<ItemDto>(`/items/${id}/stock-adjustments`, input),
    onSuccess: () => invalidate(),
  });
}
