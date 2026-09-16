-- CreateEnum
CREATE TYPE "SalesReceiptStatus" AS ENUM ('draft', 'completed', 'void');

-- CreateTable
CREATE TABLE "sales_receipts" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "receipt_date" DATE NOT NULL,
    "payment_mode_id" UUID,
    "reference_number" TEXT,
    "status" "SalesReceiptStatus" NOT NULL DEFAULT 'draft',
    "subtotal" DECIMAL(18,2) NOT NULL,
    "discount_total" DECIMAL(18,2) NOT NULL,
    "tax_total" DECIMAL(18,2) NOT NULL,
    "shipping_charge" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adjustment" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,2) NOT NULL,
    "customer_notes" TEXT,
    "terms" TEXT,
    "completed_at" TIMESTAMP(3),
    "voided_at" TIMESTAMP(3),
    "void_reason" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_receipt_lines" (
    "id" UUID NOT NULL,
    "sales_receipt_id" UUID NOT NULL,
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

    CONSTRAINT "sales_receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_receipts_number_key" ON "sales_receipts"("number");

-- CreateIndex
CREATE INDEX "sales_receipts_customer_id_idx" ON "sales_receipts"("customer_id");

-- CreateIndex
CREATE INDEX "sales_receipts_status_idx" ON "sales_receipts"("status");

-- CreateIndex
CREATE INDEX "sales_receipts_receipt_date_idx" ON "sales_receipts"("receipt_date");

-- CreateIndex
CREATE INDEX "sales_receipt_lines_sales_receipt_id_idx" ON "sales_receipt_lines"("sales_receipt_id");

-- CreateIndex
CREATE INDEX "sales_receipt_lines_item_id_idx" ON "sales_receipt_lines"("item_id");

-- AddForeignKey
ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_payment_mode_id_fkey" FOREIGN KEY ("payment_mode_id") REFERENCES "payment_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_receipts" ADD CONSTRAINT "sales_receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_receipt_lines" ADD CONSTRAINT "sales_receipt_lines_sales_receipt_id_fkey" FOREIGN KEY ("sales_receipt_id") REFERENCES "sales_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_receipt_lines" ADD CONSTRAINT "sales_receipt_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_receipt_lines" ADD CONSTRAINT "sales_receipt_lines_tax_id_fkey" FOREIGN KEY ("tax_id") REFERENCES "taxes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
