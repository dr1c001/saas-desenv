-- Estoque POR LOCAL.
--
-- Ate aqui o saldo era um numero so por peca. "Tem 4 no estoque" nao responde
-- a pergunta que o dono de uma empresa de campo faz: *onde*. A van de cada
-- tecnico e um almoxarifado que anda, e a peca pode estar do outro lado da
-- cidade. Regras em lib/estoque-local.ts.

CREATE TYPE "StockLocationType" AS ENUM ('ALMOXARIFADO', 'VEICULO');

CREATE TABLE "StockLocation" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "type"      "StockLocationType" NOT NULL DEFAULT 'ALMOXARIFADO',
  "userId"    TEXT,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StockLocation_pkey" PRIMARY KEY ("id")
);

-- Dois locais com o mesmo nome na mesma empresa seriam indistinguiveis na hora
-- de escolher — e a escolha errada move peca de verdade.
CREATE UNIQUE INDEX "StockLocation_tenantId_name_key" ON "StockLocation"("tenantId", "name");
CREATE INDEX "StockLocation_tenantId_active_idx" ON "StockLocation"("tenantId", "active");

ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SetNull: apagar a pessoa nao pode levar junto a van com o que tem dentro.
ALTER TABLE "StockLocation" ADD CONSTRAINT "StockLocation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── O saldo por local ───────────────────────────────────────────────────────
--
-- Part.stock CONTINUA sendo o total, porque ele ja e lido pelo alerta de
-- minimo, pela listagem, pela escolha na OS e pelos relatorios. Os dois sao
-- escritos na mesma transacao, e ha teste garantindo que o total e a soma.
CREATE TABLE "StockBalance" (
  "id"         TEXT NOT NULL,
  "partId"     TEXT NOT NULL,
  "locationId" TEXT NOT NULL,
  "quantity"   DECIMAL(12,3) NOT NULL DEFAULT 0,
  CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- Um saldo por peca por local. Duplicado faria a soma contar duas vezes.
CREATE UNIQUE INDEX "StockBalance_partId_locationId_key" ON "StockBalance"("partId", "locationId");
CREATE INDEX "StockBalance_locationId_idx" ON "StockBalance"("locationId");

ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── O movimento passa a saber onde aconteceu ────────────────────────────────
--
-- `balanceAfter` deixa de ser o total da empresa e passa a ser o saldo DAQUELE
-- local. Nas linhas que ja existem os dois coincidem, porque todo o estoque
-- atual vai para um local so (abaixo) — entao o historico antigo continua
-- verdadeiro sem precisar ser reescrito.
--
-- Transferencia e um PAR de movimentos (saida na origem, entrada no destino)
-- ligados por `transferId`, e nao um tipo novo de movimento: `balanceAfter` e
-- por local, e uma linha so nao guarda dois saldos.
ALTER TABLE "StockMovement" ADD COLUMN "locationId"   TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "toLocationId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN "transferId"   TEXT;

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_toLocationId_fkey"
  FOREIGN KEY ("toLocationId") REFERENCES "StockLocation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "StockMovement_locationId_createdAt_idx" ON "StockMovement"("locationId", "createdAt");

-- ─── A parte que nao pode falhar: o estoque de hoje nao pode sumir ───────────
--
-- Sem isto, toda empresa que ja usa estoque abriria a tela e veria os saldos
-- fora de qualquer local — presentes no total e invisiveis na unica tela que
-- passa a importar. Por isso a migracao CRIA o almoxarifado e coloca o que
-- existe dentro dele, em vez de deixar para uma rotina depois.
--
-- Só para quem tem peca cadastrada: criar local em empresa que nunca usou
-- estoque seria sujeira na tela de quem nem contratou o recurso.
INSERT INTO "StockLocation" ("id", "tenantId", "name", "type", "active", "createdAt")
SELECT
  -- id estavel e legivel, sem depender de extensao de UUID no banco.
  'loc_' || substr(md5(p."tenantId" || ':almoxarifado'), 1, 20),
  p."tenantId",
  'Almoxarifado',
  'ALMOXARIFADO',
  true,
  CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "tenantId" FROM "Part") p;

-- O saldo de cada peca vai inteiro para o almoxarifado da empresa dela.
INSERT INTO "StockBalance" ("id", "partId", "locationId", "quantity")
SELECT
  'bal_' || substr(md5(pa."id" || ':' || l."id"), 1, 20),
  pa."id",
  l."id",
  pa."stock"
FROM "Part" pa
JOIN "StockLocation" l ON l."tenantId" = pa."tenantId" AND l."name" = 'Almoxarifado';

-- E o historico antigo passa a apontar para esse mesmo local: ele aconteceu
-- ali, ja que era o unico lugar que existia.
UPDATE "StockMovement" m
SET "locationId" = l."id"
FROM "StockLocation" l
WHERE l."tenantId" = m."tenantId" AND l."name" = 'Almoxarifado' AND m."locationId" IS NULL;
