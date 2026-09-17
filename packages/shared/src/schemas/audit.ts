import { z } from 'zod';
import { dateSchema, paginationQuerySchema } from './common.js';

export const auditLogQuerySchema = paginationQuerySchema.extend({
  entityType: z.string().trim().max(50).optional(),
  action: z.string().trim().max(50).optional(),
  userId: z.uuid().optional(),
  dateFrom: dateSchema.optional(),
  dateTo: dateSchema.optional(),
});
export type AuditLogQuery = z.output<typeof auditLogQuerySchema>;
