import type { Paginated } from '@spms/shared';

export interface PageQuery {
  page: number;
  pageSize: number;
}

export function pageArgs({ page, pageSize }: PageQuery): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function paginated<T>(data: T[], total: number, { page, pageSize }: PageQuery): Paginated<T> {
  return { data, meta: { page, pageSize, total } };
}

export type SortDirection = 'asc' | 'desc';

/**
 * Turns `?sort=-date` into a Prisma orderBy entry using a whitelist of sortable fields.
 * Unknown fields fall back to the default so user input never reaches the query directly.
 */
export function parseSort<T>(
  sort: string | undefined,
  fields: Record<string, (direction: SortDirection) => T>,
  fallback: string,
): T {
  const candidate = sort && fields[sort.replace(/^-/, '')] ? sort : fallback;
  const direction: SortDirection = candidate.startsWith('-') ? 'desc' : 'asc';
  const build = fields[candidate.replace(/^-/, '')];
  if (!build) throw new Error(`Default sort "${fallback}" is not in the sortable fields`);
  return build(direction);
}
