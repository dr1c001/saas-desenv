-- Data de COMPETÊNCIA: quando o fato aconteceu, separada de quando o dinheiro
-- se moveu.
--
-- ─── O erro que isto conserta ────────────────────────────────────────────────
--
-- O DRE somava receita e despesa por data de PAGAMENTO. Um serviço executado e
-- recebido em janeiro, cuja comissão vence dia 5 de fevereiro, punha a receita
-- em janeiro e o custo dela em fevereiro:
--
--   janeiro  → lucro inflado (receita sem o custo que a gerou)
--   fevereiro → prejuízo artificial (custo sem a receita que o justificou)
--
-- Todo mês, na mesma direção, e a distorção cresce na proporção em que o
-- recurso de comissão for usado. Ninguém percebe porque os dois números são
-- plausíveis: janeiro só parece um mês bom.
--
-- Isso nunca foi só da comissão — o aluguel pago dia 5 tem o mesmo problema. A
-- diferença é que a comissão é CAUSADA por uma receita específica de um mês
-- específico; o aluguel não tem par.
--
-- ─── Por que NULL, e por que ninguém é obrigado a preencher ─────────────────
--
-- Há lançamentos em produção. NOT NULL falharia, e um DEFAULT inventado
-- carimbaria competência errada em tudo que já existe. Onde é nulo vale o
-- VENCIMENTO — que é a melhor aproximação disponível de "quando isso era
-- devido" e é o que o dono digitou pensando no mês do lançamento.
--
-- ─── Por que o relatório NÃO muda sozinho ───────────────────────────────────
--
-- O DRE continua nascendo em regime de CAIXA, como sempre foi. A competência é
-- uma segunda leitura que o dono escolhe. Trocar o padrão faria todos os meses
-- que ele já conferiu mudarem de valor de um dia para o outro, sem ele ter
-- pedido — e o relatório é justamente o número em que ele mais confia.

ALTER TABLE "Revenue" ADD COLUMN "accrualDate" TIMESTAMP(3);
ALTER TABLE "Expense" ADD COLUMN "accrualDate" TIMESTAMP(3);

-- Índices para o DRE em competência: sem eles, trocar de regime varreria a
-- tabela inteira em toda troca de período.
CREATE INDEX "Revenue_tenantId_accrualDate_idx" ON "Revenue"("tenantId", "accrualDate");
CREATE INDEX "Expense_tenantId_accrualDate_idx" ON "Expense"("tenantId", "accrualDate");

-- ─────────────────────────────────────────────────────────────────────────────
-- Preenche o que dá para preencher com certeza.
--
-- A receita de uma OS tem competência na CONCLUSÃO do serviço: é quando o
-- trabalho foi entregue, e é o mês a que aquele dinheiro pertence. A comissão
-- da mesma OS ganha a MESMA data — que é o ponto: as duas passam a cair juntas.
--
-- Só onde a OS tem `concludedAt`. Sem ela não há data confiável, e inventar uma
-- seria pior do que deixar cair no vencimento.
UPDATE "Revenue" r
SET "accrualDate" = o."concludedAt"
FROM "ServiceOrder" o
WHERE o.id = r."orderId" AND o."concludedAt" IS NOT NULL AND r."accrualDate" IS NULL;

UPDATE "Expense" e
SET "accrualDate" = o."concludedAt"
FROM "ServiceOrder" o
WHERE o.id = e."orderId" AND o."concludedAt" IS NOT NULL AND e."accrualDate" IS NULL;
