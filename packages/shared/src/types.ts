import type {
  ContactKind,
  DateFormat,
  DiscountType,
  DocumentType,
  ItemType,
  StockMovementType,
} from './constants.js';
import type { Permission } from './permissions.js';
import type { QuoteDisplayStatus, QuoteStatus } from './statuses.js';
import type { TaxBreakdownEntry } from './totals.js';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

/** `details` entry of a VALIDATION_ERROR (and of single-field business-rule errors). */
export interface ValidationIssue {
  path: string;
  message: string;
}

export interface NamedRef {
  id: string;
  name: string;
}

// ---------- System ----------

export interface OrganizationDto {
  name: string;
  email: string | null;
  phone: string | null;
  website: string | null;
  taxNumber: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  currencyCode: string;
  currencySymbol: string;
  dateFormat: DateFormat;
  fiscalYearStartMonth: number;
  timezone: string;
  hasLogo: boolean;
  updatedAt: string;
}

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
  role: NamedRef;
  permissions: Permission[];
}

export interface MeDto {
  user: AuthUserDto;
  organization: OrganizationDto;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  role: NamedRef;
  createdAt: string;
}

export interface RoleDto {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
}

export interface NumberSeriesDto {
  documentType: DocumentType;
  label: string;
  prefix: string;
  nextNumber: number;
  padding: number;
  preview: string;
}

export interface PaymentTermDto {
  id: string;
  name: string;
  days: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface TaxDto {
  id: string;
  name: string;
  rate: string;
  isActive: boolean;
}

export interface PaymentModeDto {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface ExpenseCategoryDto {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface AuditLogDto {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  changes: Record<string, { from: unknown; to: unknown }> | null;
  user: NamedRef | null;
  createdAt: string;
}

// ---------- Contacts ----------

export interface AddressDto {
  attention: string | null;
  line1: string | null;
  line2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
}

export interface ContactPersonDto {
  id: string;
  salutation: string | null;
  firstName: string;
  lastName: string | null;
  email: string | null;
  workPhone: string | null;
  mobile: string | null;
  designation: string | null;
  isPrimary: boolean;
}

export interface ContactListItemDto {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  workPhone: string | null;
  isActive: boolean;
  /** Receivable for customers, payable for vendors. */
  balance: string;
  createdAt: string;
}

export interface ContactDto {
  id: string;
  kind: ContactKind;
  salutation: string | null;
  firstName: string | null;
  lastName: string | null;
  companyName: string | null;
  displayName: string;
  email: string | null;
  workPhone: string | null;
  mobile: string | null;
  website: string | null;
  taxNumber: string | null;
  paymentTerm: { id: string; name: string; days: number } | null;
  openingBalance: string;
  notes: string | null;
  isActive: boolean;
  billingAddress: AddressDto | null;
  shippingAddress: AddressDto | null;
  contactPersons: ContactPersonDto[];
  createdAt: string;
  updatedAt: string;
}

export interface ContactSummaryDto {
  outstandingReceivables: string;
  unusedCredits: string;
}

// ---------- Items ----------

export interface ItemListItemDto {
  id: string;
  type: ItemType;
  name: string;
  sku: string | null;
  unit: string | null;
  sellingPrice: string | null;
  salesDescription: string | null;
  costPrice: string | null;
  taxId: string | null;
  trackInventory: boolean;
  stockOnHand: string | null;
  reorderLevel: string | null;
  isActive: boolean;
}

export interface ItemDto extends ItemListItemDto {
  purchaseDescription: string | null;
  tax: { id: string; name: string; rate: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockMovementDto {
  id: string;
  date: string;
  type: StockMovementType;
  quantity: string;
  reason: string | null;
  sourceType: string | null;
  sourceId: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
}

// ---------- Documents ----------

export interface DocumentLineDto {
  id: string;
  position: number;
  itemId: string | null;
  name: string;
  description: string | null;
  quantity: string;
  unit: string | null;
  rate: string;
  discountType: DiscountType;
  discountValue: string;
  taxId: string | null;
  taxName: string | null;
  taxRate: string | null;
  amount: string;
  taxAmount: string;
}

export interface DocumentCustomerDto {
  id: string;
  displayName: string;
  companyName: string | null;
  email: string | null;
  billingAddress: AddressDto | null;
  shippingAddress: AddressDto | null;
}

export interface QuoteListItemDto {
  id: string;
  number: string;
  quoteDate: string;
  expiryDate: string | null;
  referenceNumber: string | null;
  status: QuoteStatus;
  displayStatus: QuoteDisplayStatus;
  total: string;
  customer: { id: string; displayName: string };
}

export interface QuoteDto extends Omit<QuoteListItemDto, 'customer'> {
  subject: string | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  taxBreakdown: TaxBreakdownEntry[];
  shippingCharge: string;
  adjustment: string;
  customerNotes: string | null;
  terms: string | null;
  lines: DocumentLineDto[];
  customer: DocumentCustomerDto;
  sentAt: string | null;
  acceptedAt: string | null;
  declinedAt: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
}

export type StatusCountsDto = Record<string, number>;

export interface SearchResultsDto {
  customers: { id: string; displayName: string; companyName: string | null }[];
  items: { id: string; name: string; sku: string | null }[];
  quotes: { id: string; number: string; customerName: string }[];
}
