-- CreateTable
CREATE TABLE "payments_received" (
    "id" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "payment_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "bank_charges" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "payment_mode_id" UUID,
    "reference_number" TEXT,
    "notes" TEXT,
    "amount_applied" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amount_refunded" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_received_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "invoice_id" UUID NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "refund_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_mode_id" UUID,
    "reference_number" TEXT,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_received_number_key" ON "payments_received"("number");

-- CreateIndex
CREATE INDEX "payments_received_customer_id_idx" ON "payments_received"("customer_id");

-- CreateIndex
CREATE INDEX "payments_received_payment_date_idx" ON "payments_received"("payment_date");

-- CreateIndex
CREATE INDEX "payment_allocations_invoice_id_idx" ON "payment_allocations"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_invoice_id_key" ON "payment_allocations"("payment_id", "invoice_id");

-- CreateIndex
CREATE INDEX "payment_refunds_payment_id_idx" ON "payment_refunds"("payment_id");

-- AddForeignKey
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "contacts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_payment_mode_id_fkey" FOREIGN KEY ("payment_mode_id") REFERENCES "payment_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments_received" ADD CONSTRAINT "payments_received_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments_received"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments_received"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_payment_mode_id_fkey" FOREIGN KEY ("payment_mode_id") REFERENCES "payment_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_refunds" ADD CONSTRAINT "payment_refunds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
