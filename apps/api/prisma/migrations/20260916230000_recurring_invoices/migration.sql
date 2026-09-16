-- CreateEnum
CREATE TYPE "RecurrenceUnit" AS ENUM ('day', 'week', 'month', 'year');

-- CreateEnum
CREATE TYPE "RecurringProfileStatus" AS ENUM ('active', 'stopped');

-- CreateEnum
CREATE TYPE "RecurringCreateAs" AS ENUM ('draft', 'sent');

-- AlterTable
ALTER TABLE "invoices" ADD COLUMN     "recurring_period_date" DATE,
ADD COLUMN     "recurring_profile_id" UUID;

-- CreateTable
CREATE TABLE "recurring_invoice_profiles" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "repeat_every" INTEGER NOT NULL DEFAULT 1,
    "repeat_unit" "RecurrenceUnit" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "payment_term_id" UUID,
    "create_as" "RecurringCreateAs" NOT NULL DEFAULT 'draft',
    "status" "RecurringProfileStatus" NOT NULL DEFAULT 'active',
    "next_index" INTEGER NOT NULL DEFAULT 0,
    "next_run_date" DATE NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "last_error" TEXT,
    "order_number" TEXT,
    "subject" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_total" DECIMAL(18,2) NOT NULL,
    "tax_total" DECIMAL(18,2) NOT NULL,
    "shipping_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "customer_notes" TEXT,
    "terms" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_invoice_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_invoice_lines" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "item_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(18,3) NOT NULL,
    "unit" TEXT,
    "rate" DECIMAL(18,2) NOT NULL,
    "discount_type" "DiscountType" NOT NULL DEFAULT 'percent',
    "discount_value" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tax_id" UUID,
    "tax_name" TEXT,
    "tax_rate" DECIMAL(6,3),
    "amount" DECIMAL(18,2) NOT NULL,
    "tax_amount" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "recurring_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_invoice_profiles_customer_id_idx" ON "recurring_invoice_profiles"("customer_id");

-- CreateIndex
CREATE INDEX "recurring_invoice_profiles_status_next_run_date_idx" ON "recurring_invoice_profiles"("status", "next_run_date");

-- CreateIndex
CREATE INDEX "recurring_invoice_lines_profile_id_idx" ON "recurring_invoice_lines"("profile_id");

-- CreateIndex
CREATE INDEX "recurring_invoice_lines_item_id_idx" ON "recurring_invoice_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_recurring_profile_id_recurring_period_date_key" ON "invoices"("recurring_profile_id", "recurring_period_date");

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurring_profile_id_fkey" FOREIGN KEY ("recurring_profile_id") REFERENCES "recurring_invoice_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_profiles" ADD CONSTRAINT "recurring_invoice_profiles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_profiles" ADD CONSTRAINT "recurring_invoice_profiles_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_profiles" ADD CONSTRAINT "recurring_invoice_profiles_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_lines" ADD CONSTRAINT "recurring_invoice_lines_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "recurring_invoice_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_lines" ADD CONSTRAINT "recurring_invoice_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_invoice_lines" ADD CONSTRAINT "recurring_invoice_lines_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

