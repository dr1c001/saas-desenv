-- Filiais: uma empresa com mais de uma unidade.
--
-- O QUE E ESCOPADO por filial: clientes, ordens de servico, agenda, financeiro
-- (receitas e despesas) e a equipe.
-- O QUE E COMPARTILHADO, por decisao: estoque e pecas, fornecedores e compras,
-- orcamentos, contratos, configuracoes, plano e cobranca.
--
-- A lista de compartilhados nao e esquecimento. 447 consultas do sistema
-- filtram por tenantId; escopar todas por filial de uma vez seria reescrever o
-- sistema inteiro. E filial meio-feita — algumas telas filtrando e outras nao
-- — e PIOR que nenhuma, porque promete separacao e vaza. Melhor separar
-- inteiro o que da, e dizer na tela o que e comum. Regra em lib/filial.ts.
--
-- TODAS as colunas branchId nascem NULL, e registro SEM filial e visto por
-- TODOS. Sem essa regra, criar a primeira filial faria a base historica
-- inteira da empresa desaparecer da tela — anos de cliente e OS sumindo porque
-- alguem cadastrou "Unidade Centro". Por isso a migration nao preenche nada:
-- ligar filiais nao muda o que ninguem ve ate a empresa vincular a primeira
-- pessoa.

CREATE TABLE "Branch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Branch_tenantId_active_idx" ON "Branch"("tenantId", "active");

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ON DELETE SET NULL em todas: apagar uma filial nao pode apagar o cliente, a
-- OS nem a receita dela. O registro volta a ser "sem filial", que e visivel
-- para todos — perder faturamento porque alguem removeu uma unidade seria
-- destruicao de dado por um clique de organizacao.

ALTER TABLE "User" ADD COLUMN "branchId" TEXT;
CREATE INDEX "User_branchId_idx" ON "User"("branchId");
ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Client" ADD COLUMN "branchId" TEXT;
CREATE INDEX "Client_tenantId_branchId_idx" ON "Client"("tenantId", "branchId");
ALTER TABLE "Client" ADD CONSTRAINT "Client_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceOrder" ADD COLUMN "branchId" TEXT;
CREATE INDEX "ServiceOrder_tenantId_branchId_idx" ON "ServiceOrder"("tenantId", "branchId");
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Revenue" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Expense" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
