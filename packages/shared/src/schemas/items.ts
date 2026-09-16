import { z } from 'zod';
import { ITEM_TYPES } from '../constants.js';
import {
  activeListQuerySchema,
  dateSchema,
  optionalIdSchema,
  optionalMoneySchema,
  optionalQuantitySchema,
  optionalText,
  requiredText,
  signedQuantitySchema,
} from './common.js';

export const itemSchema = z
  .object({
    type: z.enum(ITEM_TYPES).default('goods'),
    name: requiredText(200, 'Name'),
    sku: optionalText(64),
    unit: optionalText(20),
    sellingPrice: optionalMoneySchema,
    salesDescription: optionalText(2000),
    costPrice: optionalMoneySchema,
    purchaseDescription: optionalText(2000),
    taxId: optionalIdSchema,
    preferredVendorId: optionalIdSchema,
    trackInventory: z.boolean().default(false),
    /** Only used when inventory tracking is switched on. */
    openingStock: optionalQuantitySchema,
    reorderLevel: optionalQuantitySchema,
  })
  .refine((data) => !data.trackInventory || data.type === 'goods', {
    message: 'Only goods can track inventory',
    path: ['trackInventory'],
  });
export type ItemInput = z.input<typeof itemSchema>;
export type ItemOutput = z.output<typeof itemSchema>;

export const stockAdjustmentSchema = z.object({
  date: dateSchema,
  quantityChange: signedQuantitySchema.refine(
    (value) => Number(value) !== 0,
    'Quantity change cannot be zero',
  ),
  reason: requiredText(200, 'Reason'),
});
export type StockAdjustmentInput = z.input<typeof stockAdjustmentSchema>;

export const itemListQuerySchema = activeListQuerySchema.extend({
  type: z.enum(ITEM_TYPES).optional(),
});
export type ItemListQuery = z.output<typeof itemListQuerySchema>;
export type StockAdjustmentOutput = z.output<typeof stockAdjustmentSchema>;
