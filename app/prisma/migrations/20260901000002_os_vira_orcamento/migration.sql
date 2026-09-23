-- A visita que vira orcamento.
--
-- O cliente liga, a empresa abre a OS, o tecnico vai ate o endereco — e no
-- local descobre que o servico e maior do que o telefonema sugeria. O cliente
-- entao so quer saber quanto custa.
--
-- Ate aqui essa visita virava uma OS orfa: fechar com valor cheio cobraria um
-- servico que nao houve; cancelar apagaria o deslocamento que aconteceu de
-- verdade. Regra em lib/os-orcamento.ts.

-- O vinculo. SetNull, e nao Cascade: apagar a OS nao pode levar junto o
-- orcamento que o cliente ja recebeu, e talvez ja tenha aprovado.
ALTER TABLE "Quote" ADD COLUMN "orderId" TEXT;

ALTER TABLE "Quote" ADD CONSTRAINT "Quote_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Quote_orderId_idx" ON "Quote"("orderId");

-- A taxa de visita, por empresa.
--
-- Umas cobram o deslocamento mesmo com o orcamento recusado; outras absorvem
-- como custo de vender. NULL = nao cobra, e e o padrao — nenhuma empresa passa
-- a cobrar nada no dia em que esta coluna nasce.
ALTER TABLE "Tenant" ADD COLUMN "visitFee" DECIMAL(10,2);
