-- Comissão por ordem de serviço.
--
-- O funcionário comissionado ganha uma porcentagem por OS concluída. A
-- porcentagem é de CADA OS (varia por serviço), e a comissão vira uma linha no
-- contas a pagar assim que a OS é concluída.
--
-- Nada aqui muda uma OS existente: `commissionPct` nasce NULL em todas, e NULL
-- quer dizer "esta OS não comissiona". O recurso liga sozinho quando alguém
-- digita a primeira porcentagem.

-- A porcentagem daquela OS. NULL ≠ 0: NULL é "não comissiona", 0 seria a
-- decisão consciente de comissionar nada.
ALTER TABLE "ServiceOrder" ADD COLUMN "commissionPct" DECIMAL(5,2);

-- Porcentagem fora de 0..100 é engano de digitação, e engano de digitação em
-- porcentagem vira dinheiro errado no contas a pagar de uma pessoa. A trava
-- mora no banco porque a Action não é o único caminho até esta coluna.
ALTER TABLE "ServiceOrder"
  ADD CONSTRAINT "ServiceOrder_commissionPct_valido"
  CHECK ("commissionPct" IS NULL OR ("commissionPct" >= 0 AND "commissionPct" <= 100));

-- A despesa passa a poder apontar para a OS que a gerou, e para quem recebe.
ALTER TABLE "Expense" ADD COLUMN "orderId" TEXT;
ALTER TABLE "Expense" ADD COLUMN "payeeId" TEXT;

-- Os três números congelados no momento do cálculo. Existem para responder
-- "por que esta comissão é R$ 114,00?" por CONSULTA, e não por leitura da
-- descrição — o dono vai querer somar o ISS das comissões do mês.
ALTER TABLE "Expense" ADD COLUMN "commissionBase" DECIMAL(12,2);
ALTER TABLE "Expense" ADD COLUMN "commissionPct" DECIMAL(5,2);
ALTER TABLE "Expense" ADD COLUMN "commissionIss" DECIMAL(12,2);

-- ─────────────────────────────────────────────────────────────────────────────
-- O índice ÚNICO é a regra "uma comissão por OS", e ele vive AQUI de propósito.
--
-- A alternativa seria consultar antes de inserir, do jeito que o resto do
-- código faz hoje. Não serve: reconcluir uma OS é o fluxo NORMAL de correção
-- (o botão vira "editar" e chama a mesma ação), e duas abas abertas fazem a
-- consulta-antes-do-insert falhar exatamente no caso que ela deveria cobrir.
--
-- Índice único simples, e não parcial: no Postgres NULL nunca é igual a NULL
-- num índice único, então as milhares de despesas comuns (orderId nulo) não
-- colidem entre si. Um índice parcial funcionaria igual e economizaria espaço,
-- mas divergiria do que o Prisma gera a partir de `@unique` no schema — e a
-- divergência entre migration e schema é o defeito que o teste de drift existe
-- para pegar.
CREATE UNIQUE INDEX "Expense_orderId_key" ON "Expense"("orderId");

-- SetNull nos dois: apagar a OS, ou desligar a pessoa, não pode apagar o
-- dinheiro que a empresa ficou devendo. É a mesma política já escrita para
-- Revenue.orderId e para Expense.purchaseOrderId.
ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_payeeId_fkey"
  FOREIGN KEY ("payeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- "Quanto a empresa deve de comissão para a Ana este mês" é a consulta do
-- fechamento, e sem isto ela varre a tabela inteira de despesas.
CREATE INDEX "Expense_payeeId_status_idx" ON "Expense"("payeeId", "status");
