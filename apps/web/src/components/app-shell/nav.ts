import type { Permission } from '@spms/shared';
import {
  BanknoteArrowDownIcon,
  BanknoteArrowUpIcon,
  ChartColumnIcon,
  FileTextIcon,
  HouseIcon,
  PackageIcon,
  ReceiptIcon,
  RefreshCwIcon,
  ScrollTextIcon,
  ShoppingCartIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission?: Permission;
  /** Module not built yet: shown greyed out so the full structure is visible. */
  soon?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  { items: [{ href: '/', label: 'Home', icon: HouseIcon }] },
  { items: [{ href: '/items', label: 'Items', icon: PackageIcon, permission: 'items:view' }] },
  {
    label: 'Sales',
    items: [
      { href: '/customers', label: 'Customers', icon: UsersIcon, permission: 'customers:view' },
      { href: '/quotes', label: 'Quotes', icon: FileTextIcon, permission: 'quotes:view' },
      { href: '/invoices', label: 'Invoices', icon: ReceiptIcon, permission: 'invoices:view' },
      { href: '/sales-receipts', label: 'Sales Receipts', icon: ScrollTextIcon, permission: 'sales_receipts:view', soon: true },
      { href: '/recurring-invoices', label: 'Recurring Invoices', icon: RefreshCwIcon, permission: 'recurring_invoices:view', soon: true },
      { href: '/payments-received', label: 'Payments Received', icon: BanknoteArrowDownIcon, permission: 'payments_received:view' },
      { href: '/credit-notes', label: 'Credit Notes', icon: WalletIcon, permission: 'credit_notes:view' },
    ],
  },
  {
    label: 'Purchases',
    items: [
      { href: '/vendors', label: 'Vendors', icon: TruckIcon, permission: 'vendors:view', soon: true },
      { href: '/expenses', label: 'Expenses', icon: ShoppingCartIcon, permission: 'expenses:view', soon: true },
      { href: '/bills', label: 'Bills', icon: ReceiptIcon, permission: 'bills:view', soon: true },
      { href: '/payments-made', label: 'Payments Made', icon: BanknoteArrowUpIcon, permission: 'payments_made:view', soon: true },
    ],
  },
  { items: [{ href: '/reports', label: 'Reports', icon: ChartColumnIcon, permission: 'reports:view', soon: true }] },
];
