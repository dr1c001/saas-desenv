-- Controle de BENS da empresa.
--
-- O que ela comprou PARA USAR: a van, a rotativa eletrica, o notebook, a
-- bancada. Nao e peca de estoque (Part, comprada para aplicar no servico) nem
-- equipamento do cliente (Equipment, que nem e dela) — tres coisas com cara
-- parecida e naturezas opostas.
--
-- Depreciacao e regras em lib/patrimonio.ts. Os numeros sao GERENCIAIS: o
-- balanco com valor legal e peca que o contador assina.

CREATE TYPE "AssetCategory" AS ENUM (
  'VEICULO', 'MAQUINA', 'FERRAMENTA', 'INFORMATICA',
  'MOVEL', 'IMOVEL', 'TERRENO', 'OUTRO'
);

CREATE TYPE "AssetStatus" AS ENUM ('ATIVO', 'MANUTENCAO', 'BAIXADO');

CREATE TABLE "Asset" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "category"      "AssetCategory" NOT NULL DEFAULT 'OUTRO',
  "brand"         TEXT,
  "model"         TEXT,
  "serialNumber"  TEXT,
  "purchaseValue" DECIMAL(12,2) NOT NULL,
  "purchasedAt"   TIMESTAMP(3) NOT NULL,
  "annualRate"    DECIMAL(5,2),
  "residualValue" DECIMAL(12,2),
  "status"        "AssetStatus" NOT NULL DEFAULT 'ATIVO',
  "disposedAt"    TIMESTAMP(3),
  "disposalNotes" TEXT,
  "locationId"    TEXT,
  "responsibleId" TEXT,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Asset_tenantId_status_idx" ON "Asset"("tenantId", "status");
CREATE INDEX "Asset_tenantId_createdAt_idx" ON "Asset"("tenantId", "createdAt");
CREATE INDEX "Asset_locationId_idx" ON "Asset"("locationId");
CREATE INDEX "Asset_responsibleId_idx" ON "Asset"("responsibleId");

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SetNull nos dois: apagar o local ou desligar a pessoa nao pode apagar o BEM,
-- que continua existindo e valendo dinheiro.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_responsibleId_fkey"
  FOREIGN KEY ("responsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── As travas de sanidade ──────────────────────────────────────────────────
--
-- Valor negativo nao existe. Zero existe: bem doado, ou recebido em troca.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_valor_nao_negativo"
  CHECK ("purchaseValue" >= 0);

-- Taxa fora de 0-100 depreciaria o bem em dois meses, ou nunca.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_taxa_valida"
  CHECK ("annualRate" IS NULL OR ("annualRate" >= 0 AND "annualRate" <= 100));

ALTER TABLE "Asset" ADD CONSTRAINT "Asset_residual_nao_negativo"
  CHECK ("residualValue" IS NULL OR "residualValue" >= 0);

-- Baixa ANTES da compra e impossivel, e produziria depreciacao negativa.
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_baixa_depois_da_compra"
  CHECK ("disposedAt" IS NULL OR "disposedAt" >= "purchasedAt");

-- ─── O bem ganha nota fiscal e foto ─────────────────────────────────────────
--
-- Quarto dono possivel do anexo. A trava de dono unico foi escrita como
-- `num_nonnulls(...) = 1` justamente para crescer com um argumento a mais, em
-- vez de virar oito combinacoes escritas a mao.
--
-- A nota fiscal do bem e o documento que o contador pede para lancar o
-- imobilizado — e hoje ela mora numa pasta ou no e-mail de alguem.
ALTER TABLE "Attachment" ADD COLUMN "assetId" TEXT;

ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Attachment_assetId_idx" ON "Attachment"("assetId");

ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_um_dono_so";
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_um_dono_so"
  CHECK (num_nonnulls("orderId", "quoteId", "purchaseOrderId", "assetId") = 1);

-- ─── Historico de manutencao do bem ─────────────────────────────────────────
--
-- A manutencao interna ja existia sem dono definido. Ligada ao bem, ela passa
-- a responder "quantas vezes esta van parou, e quanto ja custou" — que e a
-- pergunta que decide quando trocar de veiculo.
--
-- SetNull, e nao Cascade: a manutencao ACONTECEU, e o gasto dela e real mesmo
-- depois de o bem ser vendido.
ALTER TABLE "MaintenanceOrder" ADD COLUMN "assetId" TEXT;

ALTER TABLE "MaintenanceOrder" ADD CONSTRAINT "MaintenanceOrder_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "MaintenanceOrder_assetId_idx" ON "MaintenanceOrder"("assetId");
