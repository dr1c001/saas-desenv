-- AddColumn referralDiscountPercent to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "referralDiscountPercent" INTEGER NOT NULL DEFAULT 0;
