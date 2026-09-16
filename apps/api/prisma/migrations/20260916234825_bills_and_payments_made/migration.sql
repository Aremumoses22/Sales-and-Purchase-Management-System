-- CreateEnum
CREATE TYPE "BillStatus" AS ENUM ('draft', 'open', 'void');

-- CreateTable
CREATE TABLE "bills" (
    "id" UUID NOT NULL,
    "bill_number" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "order_number" TEXT,
    "bill_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "payment_term_id" UUID,
    "status" "BillStatus" NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_total" DECIMAL(18,2) NOT NULL,
    "tax_total" DECIMAL(18,2) NOT NULL,
    "shipping_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "amount_paid" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "balance_due" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "terms" TEXT,
    "opened_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_lines" (
    "id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
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

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments_made" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "vendor_id" UUID NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_mode_id" UUID,
    "reference_number" TEXT,
    "notes" TEXT,
    "amount_applied" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_made_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bill_payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bills_status_due_date_idx" ON "bills"("status", "due_date");

-- CreateIndex
CREATE INDEX "bills_bill_date_idx" ON "bills"("bill_date");

-- CreateIndex
CREATE UNIQUE INDEX "bills_vendor_id_bill_number_key" ON "bills"("vendor_id", "bill_number");

-- CreateIndex
CREATE INDEX "bill_lines_bill_id_idx" ON "bill_lines"("bill_id");

-- CreateIndex
CREATE INDEX "bill_lines_item_id_idx" ON "bill_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_made_number_key" ON "payments_made"("number");

-- CreateIndex
CREATE INDEX "payments_made_vendor_id_idx" ON "payments_made"("vendor_id");

-- CreateIndex
CREATE INDEX "payments_made_payment_date_idx" ON "payments_made"("payment_date");

-- CreateIndex
CREATE INDEX "bill_payment_allocations_bill_id_idx" ON "bill_payment_allocations"("bill_id");

-- CreateIndex
CREATE UNIQUE INDEX "bill_payment_allocations_payment_id_bill_id_key" ON "bill_payment_allocations"("payment_id", "bill_id");

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_payment_term_id_fkey" FOREIGN KEY ("payment_term_id") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bills" ADD CONSTRAINT "bills_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_lines" ADD CONSTRAINT "bill_lines_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_made" ADD CONSTRAINT "payments_made_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_made" ADD CONSTRAINT "payments_made_payment_mode_id_fkey" FOREIGN KEY ("payment_mode_id") REFERENCES "payment_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_made" ADD CONSTRAINT "payments_made_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment_allocations" ADD CONSTRAINT "bill_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments_made"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bill_payment_allocations" ADD CONSTRAINT "bill_payment_allocations_bill_id_fkey" FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
