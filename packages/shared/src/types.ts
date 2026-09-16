import type {
  ContactKind,
  DateFormat,
  DiscountType,
  DocumentType,
  ItemType,
  StockMovementType,
} from './constants.js';
import type { RecurrenceUnit } from './dates.js';
import type { Permission } from './permissions.js';
import type {
  CreditNoteDisplayStatus,
  CreditNoteStatus,
  InvoiceDisplayStatus,
  InvoiceStatus,
  QuoteDisplayStatus,
  QuoteStatus,
  RecurringProfileDisplayStatus,
  RecurringProfileStatus,
  SalesReceiptStatus,
} from './statuses.js';
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

/** What the business owes a vendor, and payments made to them not yet used on a bill. */
export interface VendorSummaryDto {
  outstandingPayables: string;
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
  preferredVendor: { id: string; displayName: string } | null;
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
  /** The invoice this quote was converted into. */
  invoice: { id: string; number: string } | null;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
}

export type StatusCountsDto = Record<string, number>;

export interface SearchResultsDto {
  customers: { id: string; displayName: string; companyName: string | null }[];
  items: { id: string; name: string; sku: string | null }[];
  quotes: { id: string; number: string; customerName: string }[];
  invoices: { id: string; number: string; customerName: string }[];
  creditNotes: { id: string; number: string; customerName: string }[];
  salesReceipts: { id: string; number: string; customerName: string }[];
  vendors: { id: string; displayName: string; companyName: string | null }[];
}

export interface InvoiceListItemDto {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  orderNumber: string | null;
  status: InvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
  total: string;
  balanceDue: string;
  customer: { id: string; displayName: string };
}

export interface InvoiceDto extends Omit<InvoiceListItemDto, 'customer'> {
  subject: string | null;
  paymentTerm: { id: string; name: string; days: number } | null;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  taxBreakdown: TaxBreakdownEntry[];
  shippingCharge: string;
  adjustment: string;
  amountPaid: string;
  customerNotes: string | null;
  terms: string | null;
  lines: DocumentLineDto[];
  customer: DocumentCustomerDto;
  /** The quote this invoice was converted from. */
  quote: { id: string; number: string } | null;
  /** The recurring profile that generated this invoice. */
  recurringProfile: { id: string; name: string } | null;
  payments: InvoicePaymentDto[];
  credits: InvoiceCreditDto[];
  sentAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- Payments received ----------

export interface InvoicePaymentDto {
  paymentId: string;
  number: string;
  paymentDate: string;
  paymentMode: string | null;
  /** Amount of this payment applied to the invoice. */
  amount: string;
}

export interface PaymentReceivedListItemDto {
  id: string;
  number: string;
  paymentDate: string;
  referenceNumber: string | null;
  paymentMode: NamedRef | null;
  amount: string;
  unusedAmount: string;
  customer: { id: string; displayName: string };
}

export interface PaymentAllocationDto {
  id: string;
  amount: string;
  invoice: { id: string; number: string; invoiceDate: string; total: string; balanceDue: string };
}

export interface PaymentRefundDto {
  id: string;
  refundDate: string;
  amount: string;
  paymentMode: NamedRef | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface PaymentReceivedDto extends Omit<PaymentReceivedListItemDto, 'customer'> {
  bankCharges: string;
  notes: string | null;
  amountApplied: string;
  amountRefunded: string;
  allocations: PaymentAllocationDto[];
  refunds: PaymentRefundDto[];
  customer: DocumentCustomerDto;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
}

/** An invoice that can still take a payment. */
export interface OpenInvoiceDto {
  id: string;
  number: string;
  invoiceDate: string;
  dueDate: string;
  status: InvoiceStatus;
  displayStatus: InvoiceDisplayStatus;
  total: string;
  /** Balance available to this payment (includes what it already applied when editing). */
  balanceDue: string;
  /** Already applied from the payment being edited. */
  allocated: string;
}

export interface AvailableCreditsDto {
  payments: { id: string; number: string; paymentDate: string; unusedAmount: string }[];
  creditNotes: { id: string; number: string; creditNoteDate: string; balance: string }[];
  total: string;
}

// ---------- Credit notes ----------

/** A credit note applied to an invoice, as shown on the invoice. */
export interface InvoiceCreditDto {
  applicationId: string;
  creditNoteId: string;
  number: string;
  appliedDate: string;
  amount: string;
}

export interface CreditNoteListItemDto {
  id: string;
  number: string;
  creditNoteDate: string;
  referenceNumber: string | null;
  status: CreditNoteStatus;
  displayStatus: CreditNoteDisplayStatus;
  total: string;
  balance: string;
  customer: { id: string; displayName: string };
  invoice: { id: string; number: string } | null;
}

export interface CreditApplicationDto {
  id: string;
  amount: string;
  appliedDate: string;
  invoice: { id: string; number: string; invoiceDate: string; total: string; balanceDue: string };
}

export interface CreditNoteDto extends Omit<CreditNoteListItemDto, 'customer'> {
  reason: string | null;
  returnToStock: boolean;
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  taxBreakdown: TaxBreakdownEntry[];
  shippingCharge: string;
  adjustment: string;
  amountApplied: string;
  amountRefunded: string;
  customerNotes: string | null;
  terms: string | null;
  lines: DocumentLineDto[];
  customer: DocumentCustomerDto;
  applications: CreditApplicationDto[];
  refunds: PaymentRefundDto[];
  openedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- Sales receipts ----------

export interface SalesReceiptListItemDto {
  id: string;
  number: string;
  receiptDate: string;
  referenceNumber: string | null;
  paymentMode: NamedRef | null;
  status: SalesReceiptStatus;
  total: string;
  customer: { id: string; displayName: string };
}

export interface SalesReceiptDto extends Omit<SalesReceiptListItemDto, 'customer'> {
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
  completedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- Recurring invoices ----------

export interface RecurringInvoiceListItemDto {
  id: string;
  name: string;
  repeatEvery: number;
  repeatUnit: RecurrenceUnit;
  startDate: string;
  endDate: string | null;
  nextRunDate: string | null;
  lastRunAt: string | null;
  status: RecurringProfileStatus;
  displayStatus: RecurringProfileDisplayStatus;
  total: string;
  customer: { id: string; displayName: string };
}

export interface RecurringInvoiceDto extends Omit<RecurringInvoiceListItemDto, 'customer'> {
  paymentTerm: { id: string; name: string; days: number } | null;
  createAs: 'draft' | 'sent';
  orderNumber: string | null;
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
  invoiceCount: number;
  lastError: string | null;
  createdBy: NamedRef | null;
  createdAt: string;
  updatedAt: string;
}

/** What one run of the recurring invoice job did. */
export interface RecurringRunResultDto {
  created: { profileId: string; invoiceId: string; number: string; periodDate: string }[];
  failed: { profileId: string; error: string }[];
}
