-- Cotacao entre fornecedores.
--
-- Responde a pergunta que a ordem de compra nao responde: "de quem eu compro?".
-- Sem isso a empresa liga para tres fornecedores, anota num papel, e o papel
-- some — na proxima compra a comparacao e refeita do zero, muitas vezes com o
-- mesmo resultado. Regras de comparacao em lib/cotacao.ts.

CREATE TYPE "QuotationStatus" AS ENUM ('ABERTA', 'FECHADA', 'CANCELADA');

CREATE TABLE "Quotation" (
  "id"        TEXT NOT NULL,
  "tenantId"  TEXT NOT NULL,
  "number"    INTEGER NOT NULL,
  "title"     TEXT NOT NULL,
  "status"    "QuotationStatus" NOT NULL DEFAULT 'ABERTA',
  "deadline"  TIMESTAMP(3),
  "notes"     TEXT,
  "winnerId"  TEXT,
  "closedAt"  TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quotation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Quotation_tenantId_number_key" ON "Quotation"("tenantId", "number");
CREATE INDEX "Quotation_tenantId_status_idx" ON "Quotation"("tenantId", "status");
CREATE INDEX "Quotation_tenantId_createdAt_idx" ON "Quotation"("tenantId", "createdAt");

ALTER TABLE "Quotation" ADD CONSTRAINT "Quotation_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O que se esta cotando, e quanto.
CREATE TABLE "QuotationItem" (
  "id"          TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "partId"      TEXT NOT NULL,
  "quantity"    DECIMAL(12,3) NOT NULL,
  CONSTRAINT "QuotationItem_pkey" PRIMARY KEY ("id")
);

-- A mesma peca duas vezes na mesma cotacao faria a comparacao contar o dobro e
-- o total do fornecedor sair errado.
CREATE UNIQUE INDEX "QuotationItem_quotationId_partId_key" ON "QuotationItem"("quotationId", "partId");
CREATE INDEX "QuotationItem_partId_idx" ON "QuotationItem"("partId");

ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quotationId_fkey"
  FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_partId_fkey"
  FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Um fornecedor CONVIDADO a cotar.
--
-- Linha propria, e nao so um preco, para o sistema saber a diferenca entre
-- "nao respondeu" e "respondeu que nao tem" — que sao coisas diferentes na
-- hora de decidir a quem ligar da proxima vez.
CREATE TABLE "QuotationParticipant" (
  "id"          TEXT NOT NULL,
  "quotationId" TEXT NOT NULL,
  "supplierId"  TEXT NOT NULL,
  "notes"       TEXT,
  "respondedAt" TIMESTAMP(3),
  CONSTRAINT "QuotationParticipant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuotationParticipant_quotationId_supplierId_key"
  ON "QuotationParticipant"("quotationId", "supplierId");
CREATE INDEX "QuotationParticipant_supplierId_idx" ON "QuotationParticipant"("supplierId");

ALTER TABLE "QuotationParticipant" ADD CONSTRAINT "QuotationParticipant_quotationId_fkey"
  FOREIGN KEY ("quotationId") REFERENCES "Quotation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationParticipant" ADD CONSTRAINT "QuotationParticipant_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- O preco que UM fornecedor deu para UM item.
CREATE TABLE "QuotationPrice" (
  "id"            TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "itemId"        TEXT NOT NULL,
  "unitPrice"     DECIMAL(12,2) NOT NULL,
  CONSTRAINT "QuotationPrice_pkey" PRIMARY KEY ("id")
);

-- Um preco por fornecedor por item. Dois faria a soma contar duas vezes.
CREATE UNIQUE INDEX "QuotationPrice_participantId_itemId_key"
  ON "QuotationPrice"("participantId", "itemId");
CREATE INDEX "QuotationPrice_itemId_idx" ON "QuotationPrice"("itemId");

ALTER TABLE "QuotationPrice" ADD CONSTRAINT "QuotationPrice_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "QuotationParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuotationPrice" ADD CONSTRAINT "QuotationPrice_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "QuotationItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preco negativo nao existe. Zero existe (brinde, bonificacao).
ALTER TABLE "QuotationPrice" ADD CONSTRAINT "QuotationPrice_nao_negativo"
  CHECK ("unitPrice" >= 0);

-- Quantidade cotada tem de ser positiva: cotar zero nao pergunta nada.
ALTER TABLE "QuotationItem" ADD CONSTRAINT "QuotationItem_quantidade_positiva"
  CHECK ("quantity" > 0);
