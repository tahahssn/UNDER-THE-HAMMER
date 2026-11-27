-- Add planId (FK to SubscriptionPlan), checkoutUrl (TEXT), providerSessionId (TEXT) to Payment table
-- These fields support SafePay integration for checkout flow

-- Add new columns
ALTER TABLE "Payment" ADD COLUMN "planId" UUID;
ALTER TABLE "Payment" ADD COLUMN "checkoutUrl" TEXT;
ALTER TABLE "Payment" ADD COLUMN "providerSessionId" TEXT;

-- Add foreign key relation to SubscriptionPlan
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" 
  FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT;

-- Create indexes for query performance
CREATE INDEX "Payment_planId_idx" ON "Payment"("planId");
CREATE INDEX "Payment_providerSessionId_idx" ON "Payment"("providerSessionId");
CREATE UNIQUE INDEX "Payment_checkoutUrl_idx" ON "Payment"("checkoutUrl") WHERE "checkoutUrl" IS NOT NULL;

-- Add unique constraint on (providerConfigId, providerSessionId) for idempotency
CREATE UNIQUE INDEX "Payment_providerConfigId_providerSessionId_idx" 
  ON "Payment"("providerConfigId", "providerSessionId") 
  WHERE "providerSessionId" IS NOT NULL;
