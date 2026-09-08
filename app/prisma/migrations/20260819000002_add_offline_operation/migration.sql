-- Operacao vinda da fila offline do celular do tecnico.
--
-- Existe por UMA razao: idempotencia. A sincronizacao repete — a rede oscila,
-- o app reabre, a resposta se perde depois de o servidor ja ter aplicado.
-- Concluir a mesma OS duas vezes criaria DUAS receitas e baixaria o estoque em
-- DOBRO, e ninguem perceberia ate o financeiro nao fechar.
--
-- A chave primaria e o UUID gerado no CELULAR: se ja existe, a operacao ja foi
-- aplicada e a repeticao e ignorada.

CREATE TABLE "OfflineOperation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "orderId" TEXT,
    "outcome" TEXT NOT NULL,
    "reason" TEXT,
    "clientAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfflineOperation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfflineOperation_tenantId_appliedAt_idx" ON "OfflineOperation"("tenantId", "appliedAt");

CREATE INDEX "OfflineOperation_orderId_idx" ON "OfflineOperation"("orderId");

ALTER TABLE "OfflineOperation" ADD CONSTRAINT "OfflineOperation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
