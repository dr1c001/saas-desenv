-- ─────────────────────────────────────────────────────────────────────────────
-- REPARO DO HISTORICO DE MIGRATIONS
--
-- Descoberto em 11/08/2026, no primeiro build do ambiente de teste: o
-- historico de migrations NAO conseguia criar um banco do zero. Faltavam 3
-- tipos e 6 tabelas — entre elas Plan e Subscription, a espinha dorsal da
-- cobranca.
--
-- Causa: em varios momentos o schema foi aplicado com `prisma db push` em vez
-- de `migrate deploy` (ha comentario admitindo isso na migration
-- 20260719214104). O banco de producao ficou correto, mas o historico nao —
-- e um historico que nao replica significa, na pratica, NAO TER backup de
-- estrutura: se o banco se perdesse, as migrations nao o reconstruiriam.
--
-- Este arquivo cria o que faltava, de forma IDEMPOTENTE:
--   • banco novo  -> cria os objetos e destrava o resto do historico;
--   • producao    -> tudo ja existe, roda como no-op e so marca como aplicada.
--
-- A idempotencia e o ponto todo: sem ela, este arquivo derrubaria o deploy de
-- producao com "already exists".
--
-- IMPORTANTE: este arquivo cria os objetos como eles eram NAQUELE MOMENTO do
-- historico, nao como estao hoje. De proposito. Tres coisas ficaram de fora
-- porque migrations POSTERIORES as adicionam, e duplicar daria erro:
--   • valor PENDING de SubscriptionStatus   (20260719214104)
--   • Subscription.lastProcessedPaymentId   (20260803204139)
--   • Subscription.pastDueWarningsSent      (20260810203216)
--   • 7 indices de performance               (20260810033940)
-- Nao "complete" este arquivo com o schema atual — isso quebraria a replicacao.
--
-- Roda logo depois do init (por causa do timestamp no nome), antes de qualquer
-- migration que dependa desses objetos.
-- ─────────────────────────────────────────────────────────────────────────────


-- ─── Tipos ───────────────────────────────────────────────────────────────────

DO $$ BEGIN
    CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── Tabelas ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "priceMonthly" DECIMAL(10,2) NOT NULL,
    "priceYearly" DECIMAL(10,2) NOT NULL,
    "maxUsers" INTEGER,
    "features" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Subscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "asaasId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "UserAddress" (
    "id" TEXT NOT NULL,
    "street" TEXT,
    "number" TEXT,
    "complement" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "UserAddress_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ChecklistItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Quote" (
    "id" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientAddress" TEXT,
    "clientContact" TEXT,
    "description" TEXT NOT NULL,
    "materials" TEXT,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "validUntil" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,
    "clientToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Equipment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "installDate" TIMESTAMP(3),
    "warrantyUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);


-- ─── Indices ─────────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS "Plan_slug_key" ON "Plan"("slug");



CREATE UNIQUE INDEX IF NOT EXISTS "UserAddress_userId_key" ON "UserAddress"("userId");


CREATE UNIQUE INDEX IF NOT EXISTS "Quote_clientToken_key" ON "Quote"("clientToken");



CREATE UNIQUE INDEX IF NOT EXISTS "Quote_tenantId_number_key" ON "Quote"("tenantId", "number");




-- ─── Chaves estrangeiras ─────────────────────────────────────────────────────
-- Postgres nao tem "ADD CONSTRAINT IF NOT EXISTS", entao cada uma vai dentro
-- de um bloco que ignora o erro de duplicidade.

DO $$ BEGIN
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "UserAddress" ADD CONSTRAINT "UserAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ─── Colunas que nenhuma migration adiciona ──────────────────────────────────
-- Segunda camada do mesmo problema: alem de tabelas e tipos inteiros, faltavam
-- COLUNAS em tabelas que ja existiam no historico. Tambem vieram de `db push`.
-- Descobertas comparando o banco replicado com o schema, depois que as 22
-- migrations rodaram — ou seja, sao exatamente o que nenhuma delas cria.

-- AlterTable
ALTER TABLE "Address" ADD COLUMN IF NOT EXISTS "latitude" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "longitude" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "whatsapp" TEXT;

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN IF NOT EXISTS "clientSignatureUrl" TEXT,
ADD COLUMN IF NOT EXISTS "clientToken" TEXT,
ADD COLUMN IF NOT EXISTS "nfseId" TEXT,
ADD COLUMN IF NOT EXISTS "nfseNumber" TEXT,
ADD COLUMN IF NOT EXISTS "nfseStatus" TEXT,
ADD COLUMN IF NOT EXISTS "nfseUrl" TEXT,
ADD COLUMN IF NOT EXISTS "npsFeedback" TEXT,
ADD COLUMN IF NOT EXISTS "npsScore" INTEGER;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "address" TEXT,
ADD COLUMN IF NOT EXISTS "asaasCustomerId" TEXT,
ADD COLUMN IF NOT EXISTS "fiscalCityName" TEXT,
ADD COLUMN IF NOT EXISTS "fiscalCnpj" TEXT,
ADD COLUMN IF NOT EXISTS "fiscalIssRate" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "fiscalMunicipalCode" TEXT,
ADD COLUMN IF NOT EXISTS "fiscalStateCode" TEXT,
ADD COLUMN IF NOT EXISTS "nfeioCompanyId" TEXT,
ADD COLUMN IF NOT EXISTS "phone" TEXT,
ADD COLUMN IF NOT EXISTS "planId" TEXT,
ADD COLUMN IF NOT EXISTS "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "website" TEXT,
ADD COLUMN IF NOT EXISTS "zapiInstance" TEXT,
ADD COLUMN IF NOT EXISTS "zapiToken" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "document" TEXT,
ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceOrder_clientToken_key" ON "ServiceOrder"("clientToken");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
