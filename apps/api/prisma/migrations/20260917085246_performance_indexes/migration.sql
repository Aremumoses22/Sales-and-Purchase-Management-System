-- DropIndex
DROP INDEX "credit_notes_customer_id_idx";

-- DropIndex
DROP INDEX "invoices_customer_id_idx";

-- DropIndex
DROP INDEX "sales_receipts_status_idx";

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_created_at_idx" ON "audit_logs"("action", "created_at");

-- CreateIndex
CREATE INDEX "bills_vendor_id_status_idx" ON "bills"("vendor_id", "status");

-- CreateIndex
CREATE INDEX "credit_notes_customer_id_status_idx" ON "credit_notes"("customer_id", "status");

-- CreateIndex
CREATE INDEX "invoices_customer_id_status_idx" ON "invoices"("customer_id", "status");

-- CreateIndex
CREATE INDEX "invoices_status_invoice_date_idx" ON "invoices"("status", "invoice_date");

-- CreateIndex
CREATE INDEX "items_preferred_vendor_id_idx" ON "items"("preferred_vendor_id");

-- CreateIndex
CREATE INDEX "payments_made_payment_mode_id_idx" ON "payments_made"("payment_mode_id");

-- CreateIndex
CREATE INDEX "payments_received_payment_mode_id_idx" ON "payments_received"("payment_mode_id");

-- CreateIndex
CREATE INDEX "sales_receipts_status_receipt_date_idx" ON "sales_receipts"("status", "receipt_date");

-- CreateIndex
CREATE INDEX "sales_receipts_payment_mode_id_idx" ON "sales_receipts"("payment_mode_id");
