-- Quando a nota fiscal saiu.
--
-- Existe para a COTA MENSAL de NFS-e poder ser contada. A tela de planos passou
-- a vender "8 notas fiscais por mes" (Starter) e "70" (Pro), e ate aqui NADA no
-- sistema contava nota emitida — a promessa existia so na vitrine.
--
-- Coluna propria, e nao o createdAt da OS: uma OS aberta em julho e faturada em
-- agosto gasta a cota de AGOSTO, que e o mes em que a nota saiu. Contar pela
-- criacao da OS deixaria a cota do mes passado ser gasta neste.
--
-- Sem backfill: nenhuma NFS-e foi emitida em producao ate hoje (conferido — 0
-- de 11 OS com nfseId). A contagem comeca certa desde a primeira nota.

ALTER TABLE "ServiceOrder" ADD COLUMN "nfseIssuedAt" TIMESTAMP(3);

-- A cota consulta "notas emitidas por esta empresa desde o inicio do mes".
CREATE INDEX "ServiceOrder_tenantId_nfseIssuedAt_idx" ON "ServiceOrder"("tenantId", "nfseIssuedAt");
