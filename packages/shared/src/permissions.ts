export const PERMISSION_GROUPS = [
  { module: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { module: 'customers', label: 'Customers', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'vendors', label: 'Vendors', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'items', label: 'Items', actions: ['view', 'create', 'edit', 'delete', 'adjust_stock'] },
  { module: 'quotes', label: 'Quotes', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'invoices', label: 'Invoices', actions: ['view', 'create', 'edit', 'delete', 'void'] },
  {
    module: 'sales_receipts',
    label: 'Sales Receipts',
    actions: ['view', 'create', 'edit', 'delete', 'void'],
  },
  {
    module: 'recurring_invoices',
    label: 'Recurring Invoices',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    module: 'payments_received',
    label: 'Payments Received',
    actions: ['view', 'create', 'edit', 'delete'],
  },
  {
    module: 'credit_notes',
    label: 'Credit Notes',
    actions: ['view', 'create', 'edit', 'delete', 'void'],
  },
  { module: 'expenses', label: 'Expenses', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'bills', label: 'Bills', actions: ['view', 'create', 'edit', 'delete', 'void'] },
  { module: 'payments_made', label: 'Payments Made', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'reports', label: 'Reports', actions: ['view'] },
  { module: 'settings', label: 'Settings', actions: ['view', 'manage'] },
  { module: 'users', label: 'Users & Roles', actions: ['manage'] },
  { module: 'audit', label: 'Audit Log', actions: ['view'] },
] as const;

type Group = (typeof PERMISSION_GROUPS)[number];
export type Permission = {
  [G in Group as G['module']]: `${G['module']}:${G['actions'][number]}`;
}[Group['module']];

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSION_GROUPS.flatMap((group) =>
  group.actions.map((action) => `${group.module}:${action}` as Permission),
);

const PERMISSION_SET = new Set<string>(ALL_PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

export const PERMISSION_ACTION_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Create',
  edit: 'Edit',
  delete: 'Delete',
  void: 'Void',
  manage: 'Manage',
  adjust_stock: 'Adjust stock',
};

export interface DefaultRole {
  name: string;
  description: string;
  isSystem: boolean;
  permissions: readonly Permission[];
}

const viewOnly = ALL_PERMISSIONS.filter(
  (p) => p.endsWith(':view') && p !== 'audit:view' && p !== 'settings:view',
);

export const DEFAULT_ROLES: readonly DefaultRole[] = [
  {
    name: 'Admin',
    description: 'Full access, including users, roles and settings.',
    isSystem: true,
    permissions: ALL_PERMISSIONS,
  },
  {
    name: 'Accountant',
    description: 'All transactions, reports and settings. Cannot manage users or roles.',
    isSystem: false,
    permissions: ALL_PERMISSIONS.filter((p) => p !== 'users:manage'),
  },
  {
    name: 'Sales',
    description: 'Customers, items, quotes, invoices, sales receipts and payments received.',
    isSystem: false,
    permissions: [
      'dashboard:view',
      'customers:view',
      'customers:create',
      'customers:edit',
      'items:view',
      'items:create',
      'items:edit',
      'quotes:view',
      'quotes:create',
      'quotes:edit',
      'quotes:delete',
      'invoices:view',
      'invoices:create',
      'invoices:edit',
      'sales_receipts:view',
      'sales_receipts:create',
      'sales_receipts:edit',
      'recurring_invoices:view',
      'recurring_invoices:create',
      'recurring_invoices:edit',
      'payments_received:view',
      'payments_received:create',
      'credit_notes:view',
      'credit_notes:create',
    ],
  },
  {
    name: 'Viewer',
    description: 'Read-only access to transactions and reports.',
    isSystem: false,
    permissions: viewOnly,
  },
];
