export type AuditChanges = Record<string, { from: unknown; to: unknown }>;

function normalize(value: unknown): unknown {
  if (value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  // Prisma Decimal (any decimal.js instance)
  if (value !== null && typeof value === 'object' && typeof (value as { toFixed?: unknown }).toFixed === 'function') {
    return String(value);
  }
  return value;
}

/** Field-level differences between two snapshots, or null when nothing changed. */
export function diffRecords(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  ignore: readonly string[] = ['createdAt', 'updatedAt'],
): AuditChanges | null {
  const changes: AuditChanges = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (ignore.includes(key)) continue;
    const from = normalize(before[key]);
    const to = normalize(after[key]);
    if (JSON.stringify(from) !== JSON.stringify(to)) changes[key] = { from, to };
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
