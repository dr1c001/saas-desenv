-- O DESCONTO DE INDICACAO passa a ser uma tarefa com dono, e nao uma torcida.
--
-- A promessa escrita, em quatro lugares, e de UM pagamento so. A assinatura da
-- Asaas cobra o mesmo `value` em todo ciclo, entao criar a assinatura ja
-- descontada exige devolver o preco cheio quando o primeiro pagamento confirma.
-- Essa devolucao existe desde 22/09/2026 (lib/confirmar-pagamento.ts) — mas era
-- melhor esforco CEGO:
--
--   * o unico registro do desconto era `Tenant.referralDiscountPercent`, e
--     actions/billing.ts o zera assim que a assinatura e criada na Asaas;
--   * a chamada de devolucao ficava num try/catch que so escrevia no console;
--   * e ela nunca mais rodava, porque o gatilho e `status === "PENDING"` e a
--     assinatura ja tinha virado ACTIVE na mesma passagem.
--
-- Resultado: uma falha de rede na Asaas transformava "10% no primeiro
-- pagamento" num desconto vitalicio, em silencio, sem ninguem saber.
--
-- Com estas duas colunas a assinatura NASCE sabendo o que deve, e a devolucao
-- vira tarefa retentavel pelo cron diario.
--
-- Aditivas e idempotentes. Nenhum backfill: nenhuma assinatura existente nasceu
-- com desconto (nenhum tenant tem `referredByCode`), e inventar valor de
-- desconto para o passado seria pior que deixar em zero.
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "referralDiscountPercent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "fullPriceRestoredAt" TIMESTAMP(3);

-- A varredura do cron procura exatamente por estas: nasceram com desconto e
-- ainda nao tiveram o preco devolvido.
CREATE INDEX IF NOT EXISTS "Subscription_devolucao_pendente_idx"
  ON "Subscription" ("fullPriceRestoredAt")
  WHERE "referralDiscountPercent" > 0;
