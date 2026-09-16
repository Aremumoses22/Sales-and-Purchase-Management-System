# Sales & Purchase Management System

A web app for managing customers, items, quotes, invoices, payments, vendors and expenses, modelled on Zoho Books. It is built module by module following [PLAN.md](PLAN.md); the scope is in [scope.md](scope.md).

## Status

| Module | What it covers | State |
|---|---|---|
| 0 Foundation | Workspace, shared money/totals engine, API conventions, app shell | Done |
| 1 Access and settings | Sign-in, users, roles and permissions, organization profile, numbering, taxes, payment terms and modes, expense categories, audit log | Done |
| 2 Customers | Customers with addresses and contact people, search, history | Done |
| 3 Items | Goods and services, prices and taxes, stock tracking and adjustments | Done |
| 4 Quotes | Quote editor with live totals, status workflow, split view, print/PDF | Done |
| 5 Invoices | Invoices from scratch or from accepted quotes, payment terms and due dates, overdue tracking, stock updates, void, print/PDF | Done |
| 6 Payments Received | Record one payment across several invoices, keep the excess as unused credit, apply credits to invoices, refunds, receipts | Done |
| 7 Credit Notes | Credit notes from scratch or from an invoice, apply to one or more invoices (also from the invoice page), refunds, returns to stock, void, print/PDF | Done |
| 8 Sales Receipts | Sales paid on the spot with payment mode and reference, stock updates, drafts, void, clone, print/PDF; never counted as owed | Done |
| 9 Recurring Invoices | Profiles that create invoices every N days, weeks, months or years (month-end safe), hourly idempotent job, stop/resume, end dates, create invoice now | Done |
| 10–14 | Vendors, expenses, bills, dashboard, reports | Planned |

## Stack

Next.js 16 (App Router) · NestJS 12 · PostgreSQL · Prisma 7 · TypeScript · Zod · TanStack Query and Table · shadcn/ui on Tailwind CSS 4

```text
apps/api          NestJS REST API (http://localhost:4000/api/v1, docs at /api/docs)
apps/web          Next.js app (http://localhost:3000); forwards /api/* to the API
packages/shared   Zod schemas, DTO types, permissions and the document totals calculator
```

## Requirements

- Node.js 22.12 or newer
- pnpm 12: `npm install -g pnpm`
- PostgreSQL 16 or newer

## First-time setup

```bash
pnpm install

createdb spms          # development data
createdb spms_test     # emptied on every end-to-end test run

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# In apps/api/.env set DATABASE_URL, TEST_DATABASE_URL and JWT_SECRET (openssl rand -hex 48)

pnpm --filter @spms/shared build
pnpm db:migrate
pnpm db:seed
```

The seed creates the roles (Admin, Accountant, Sales, Viewer), default payment terms, payment modes, expense categories, numbering, and one admin user from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (defaults: `admin@example.com` / `Admin12345`). Change that password under **Settings → My profile**. The organization starts in Nigerian naira (NGN, ₦) with the Africa/Lagos time zone; both can be changed under **Settings → Organization**. Taxes are not seeded; add your rates (for example VAT) under **Settings → Taxes**.

## Running

```bash
pnpm dev
```

This builds the shared package, then runs it in watch mode alongside the API and the web app. Open http://localhost:3000.

The API runs the recurring invoice job every hour, creating any invoices that are due. It is safe to run more than one API process: each period is invoiced once. Set `RECURRING_JOB_ENABLED=false` to turn the job off (the e2e tests do this and call the job directly).

## Tests

```bash
pnpm test        # shared package and API unit tests
pnpm test:e2e    # API end-to-end tests against spms_test
pnpm typecheck
```
