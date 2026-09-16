import { z } from 'zod';
import { CONTACT_KINDS } from '../constants.js';
import {
  activeListQuerySchema,
  moneySchema,
  optionalEmailSchema,
  optionalIdSchema,
  optionalText,
  requiredText,
} from './common.js';

export const addressSchema = z.object({
  attention: optionalText(100),
  line1: optionalText(200),
  line2: optionalText(200),
  city: optionalText(100),
  state: optionalText(100),
  postalCode: optionalText(20),
  country: optionalText(100),
  phone: optionalText(30),
});
export type AddressInput = z.input<typeof addressSchema>;

export const contactPersonSchema = z.object({
  salutation: optionalText(10),
  firstName: requiredText(100, 'First name'),
  lastName: optionalText(100),
  email: optionalEmailSchema,
  workPhone: optionalText(30),
  mobile: optionalText(30),
  designation: optionalText(100),
  isPrimary: z.boolean().default(false),
});
export type ContactPersonInput = z.input<typeof contactPersonSchema>;

export const contactSchema = z
  .object({
    kind: z.enum(CONTACT_KINDS).default('business'),
    salutation: optionalText(10),
    firstName: optionalText(100),
    lastName: optionalText(100),
    companyName: optionalText(200),
    displayName: requiredText(200, 'Display name'),
    email: optionalEmailSchema,
    workPhone: optionalText(30),
    mobile: optionalText(30),
    website: optionalText(200),
    taxNumber: optionalText(50),
    paymentTermId: optionalIdSchema,
    openingBalance: moneySchema.default('0.00'),
    notes: optionalText(2000),
    billingAddress: addressSchema.nullish().transform((value) => value ?? null),
    shippingAddress: addressSchema.nullish().transform((value) => value ?? null),
    contactPersons: z.array(contactPersonSchema).max(20).default([]),
  })
  .refine((data) => data.contactPersons.filter((person) => person.isPrimary).length <= 1, {
    message: 'Only one contact person can be primary',
    path: ['contactPersons'],
  });
export type ContactInput = z.input<typeof contactSchema>;
export type ContactOutput = z.output<typeof contactSchema>;

export const contactListQuerySchema = activeListQuerySchema;
