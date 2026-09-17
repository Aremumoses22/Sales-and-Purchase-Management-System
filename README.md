# Sales & Purchase Management System

A web app for running the money side of a small business: customers and vendors, items and stock, quotes, invoices, payments, credit notes, sales receipts, recurring invoices, expenses and bills, with a dashboard and reports. It is modelled on Zoho Books, uses Nigerian naira by default, and was built module by module following [PLAN.md](PLAN.md); the original scope is in [scope.md](scope.md).

- [Features](#features)
- [Architecture](#architecture)
- [Setup](#setup) · [Running](#running) · [Demo data](#demo-data) · [Tests](#tests)
- [User guide](#user-guide)
- [Deployment](docs/DEPLOYMENT.md)

## Features

| Area | What you can do |
|---|---|
| Access and settings | Sign in, users with roles (Admin, Accountant, Sales, Viewer, or your own), organization profile and logo, document numbering, taxes, payment terms and modes, expense categories, and a filterable **audit log** of every change |
| Customers and vendors | Contacts with addresses and contact people, opening balances, what each owes or is owed, and all their transactions |
| Items | Goods and services with selling and cost prices, default tax, preferred vendor, optional stock tracking with adjustments and a movement history |
| Quotes | Line-item editor with per-line discounts and taxes, send / accept / decline, convert to invoice, print or save as PDF |
| Invoices | From scratch, from a quote or from a recurring profile; due dates from payment terms; Overdue, Partially Paid and Paid worked out automatically; void, clone, print |
| Payments received | One payment across several invoices, excess kept as credit, credits applied later, refunds, printable receipts |
| Credit notes | Raised against an invoice or on their own, applied to invoices, refunded, optionally returning goods to stock |
| Sales receipts | Sales paid on the spot: counted as sales, never as money owed |
| Recurring invoices | Every N days, weeks, months or years (month-end safe), created automatically each hour, stop and resume, end dates |
| Expenses | By category with tax included or added, paid-through account, vendor, receipt image or PDF upload with preview, totals for any filter |
| Bills and payments made | What you owe vendors, due dates and overdue tracking, payments across several bills, unused vendor credit applied from a bill, vendor refunds |
| Dashboard | Receivables with aging, payables, sales / receipts / expenses for a period with a 12-month chart, top expenses, invoice counts, recent activity |
| Reports | Sales by Customer and by Item, Invoice Details, Customer Statement and Balances, AR Aging Summary, Payments Received, Credit Note Details, Expenses by Category and by Vendor, Vendor Balances; each with date presets, totals, CSV export and print |

All modules in PLAN.md (0–14, including 11b) are done.

## Architecture

```text
apps/web          Next.js 16 app (App Router, React 19, Tailwind CSS 4, shadcn/ui on Base UI,
                  TanStack Query and Table, react-hook-form). The browser only talks to this origin;
                  /api/* is forwarded to the API, so cookies stay first-party and no CORS is needed.
apps/api          NestJS 12 REST API on /api/v1 with Prisma 7 and PostgreSQL. Swagger docs at /api/docs
                  in development. Runs the hourly recurring invoice job.
packages/shared   Code both sides use: Zod schemas, DTO types, permissions, status rules, dates,
                  and the money and document totals calculator.
apps/e2e          Playwright tests for the main flows, run against a running app.
docs/             Deployment guide.
```

The rules that keep the numbers right:

- **Money is exact.** Amounts are `NUMERIC(18,2)` in PostgreSQL and `decimal.js` in code, never floating point. The browser shows live totals with the same function the server uses to store them.
- **Statuses are derived.** Invoices store only draft / sent / void; Paid, Partially Paid and Overdue come from the balance and due date when read, so no nightly job is needed. Credit notes, bills and recurring profiles work the same way.
- **Balances are computed, not typed in.** An invoice's balance is its total less the payments and credits applied to it; what a customer owes is the sum of their invoice balances plus their opening balance. Reports and the dashboard use the same queries, so they always agree with the screens.
- **Money changes are atomic.** Each payment, credit or refund runs in one database transaction with row locks on the documents it touches, so two people working at once cannot over-apply a payment.
- **Sent documents are voided, not deleted,** and every change is written to the audit log with who made it and what changed.
- **Permissions are enforced by the API** (`module:action`, for example `invoices:void`); the web app only hides what you cannot do. A test checks every one of the ~180 API routes against the roles.
- **Validation is shared.** The same Zod schema checks a form in the browser and the request on the server; errors come back as `{ error: { code, message, details: [{ path, message }] } }` and appear next to the field.

## Setup

Requirements: Node.js 22.12 or newer, pnpm 12 (`npm install -g pnpm`), PostgreSQL 16 or newer.

```bash
pnpm install

createdb spms          # development data
createdb spms_test     # emptied on every API end-to-end test run

cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
# In apps/api/.env set DATABASE_URL, TEST_DATABASE_URL and JWT_SECRET (openssl rand -hex 48)

pnpm --filter @spms/shared build
pnpm db:migrate
pnpm db:seed
```

The seed creates the roles, default payment terms, payment modes, expense categories, numbering, and one admin from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` (defaults `admin@example.com` / `Admin12345`; change the password under **Settings → My profile**). The organization starts in Nigerian naira (NGN, ₦) with the Africa/Lagos time zone. Taxes are not seeded: add your rates (for example VAT at 7.5%) under **Settings → Taxes**.

## Running

```bash
pnpm dev
```

This builds the shared package and runs it in watch mode alongside the API (http://localhost:4000/api/v1) and the web app. Open http://localhost:3000.

The API creates due recurring invoices every hour. Running it more often or from several processes is safe: each period is invoiced once. Set `RECURRING_JOB_ENABLED=false` to turn the job off; **Recurring Invoices → Create due invoices now** runs it on demand.

## Demo data

To try the app with a year of realistic activity (12 Lagos customers, 6 vendors, stocked items, over 100 invoices with payments, sales receipts, bills, expenses, a credit note and recurring profiles):

```bash
createdb spms_demo
# point DATABASE_URL in apps/api/.env at spms_demo, then:
pnpm db:migrate
pnpm db:seed
pnpm db:seed:demo
```

The demo seed goes through the app's own services, so balances, stock, numbering and the audit log are all real. It only runs on a database with no transactions (set `DEMO_SEED_FORCE=true` to add to one that has some) and never with `NODE_ENV=production`.

## Tests

```bash
pnpm test        # unit tests: money and totals, status rules, schedules, report dates, config checks
pnpm test:e2e    # API end-to-end tests against spms_test (migrates, empties and seeds it first)
pnpm test:ui     # Playwright browser tests for the main flows; needs `pnpm dev` running
pnpm typecheck
pnpm lint
```

The API end-to-end tests refuse to run unless the database name ends in `_test`. The browser tests create their own uniquely named records in whatever database the running app uses.

## User guide

### First steps

1. Sign in as the admin and change the password (**Settings → My profile**).
2. **Settings → Organization:** company name, address, tax number and logo; these appear on printed documents.
3. **Settings → Taxes:** add the tax rates you charge. Check **Payment terms** (Net 30 is the default) and **Payment modes**.
4. **Settings → Transaction numbering:** set prefixes and starting numbers if you are continuing from another system.
5. **Settings → Users:** add colleagues with a temporary password and a role. They are asked to choose their own password when they first sign in. **Roles** lets you adjust what each role may do.

### Selling

- **Customers:** add a customer with their payment terms. If they already owed you money, enter it as the opening balance.
- **Items:** add what you sell. Turn on stock tracking for goods to keep count; opening stock is set when tracking starts, and later changes go through **Adjust stock**.
- **Quote → invoice:** create a quote, mark it sent, then accepted, then **Convert to invoice**. Or create an invoice directly. Saving as sent takes tracked goods out of stock.
- **Getting paid:** on an invoice, **Record payment**. One payment can cover several invoices, and anything extra stays as credit. When a customer has credit, invoices show **Credits available → Apply credits**.
- **Returns and corrections:** from an invoice's **⋯ → Create credit note**. Tick *Goods were returned* to put them back in stock, then apply the credit to invoices or refund it.
- **Paid on the spot:** use a **Sales receipt** instead of an invoice.
- **Regular billing:** a **Recurring invoice** creates invoices on a schedule, as drafts to review or already sent.
- Anything sent can be printed or saved as PDF with **Print**. Sent documents are voided rather than deleted.

### Buying

- **Vendors** work like customers.
- **Bills** record what a vendor has invoiced you, using their bill number; open bills add goods to stock.
- **Payments made** pay one or more bills. A payment made in advance becomes credit you can apply from a bill, or record a refund against if the vendor pays it back.
- **Expenses** are costs already paid, such as rent, fuel or salaries. Drop the receipt onto the form to keep it with the expense.

### Keeping track

- **Home** shows what you are owed and what you owe (with how overdue), sales, receipts and expenses for a period, and recent activity.
- **Reports** has period and balance reports; pick a period preset or dates, then **Export CSV** or **Print**.
- A customer's **Customer Statement** report is the document to send when chasing payment.
- **Settings → Audit log** shows every change, who made it and what the values were before and after.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for a production setup on a single Linux server (build, environment, database, services, HTTPS, backups and upgrades).
