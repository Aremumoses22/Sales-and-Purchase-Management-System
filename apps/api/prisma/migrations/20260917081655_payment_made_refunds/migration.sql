-- AlterTable
ALTER TABLE "payments_made" ADD COLUMN     "amount_refunded" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payment_made_refunds" (
    "id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "refund_date" DATE NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "payment_mode_id" UUID,
    "reference_number" TEXT,
    "notes" TEXT,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_made_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_made_refunds_payment_id_idx" ON "payment_made_refunds"("payment_id");

-- AddForeignKey
ALTER TABLE "payment_made_refunds" ADD CONSTRAINT "payment_made_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments_made"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_made_refunds" ADD CONSTRAINT "payment_made_refunds_payment_mode_id_fkey" FOREIGN KEY ("payment_mode_id") REFERENCES "payment_modes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_made_refunds" ADD CONSTRAINT "payment_made_refunds_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
