-- AddColumn referralCode and referredByCode to Tenant
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "referralCode" TEXT;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "referredByCode" TEXT;

-- CreateIndex unique on referralCode
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_referralCode_key" ON "Tenant"("referralCode");
