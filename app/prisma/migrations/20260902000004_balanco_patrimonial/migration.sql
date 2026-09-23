-- O BALANCO PATRIMONIAL.
--
-- O sistema ja sabe quanto entrou e saiu, quanto ha para receber e para pagar,
-- quanto vale o estoque e quanto valem os bens depreciados. O que ele NAO sabe,
-- e por isso passa a perguntar, e o que vive fora dele.
--
-- Regras em lib/balanco.ts; a conferencia em lib/contador-agente.ts. Os numeros
-- sao GERENCIAIS: o balanco com valor legal e peca que o contador assina.

-- ─── O que o sistema nao tem como calcular ──────────────────────────────────
--
-- CAIXA INICIAL: quanto a empresa tinha no dia em que comecou a usar o sistema.
-- Sem isso o caixa calculado e so o movimento desde entao, e uma empresa que ja
-- existia aparece com caixa NEGATIVO no primeiro mes em que paga mais do que
-- recebe — o achado mais comum do conferente, e quase nunca dinheiro de verdade.
--
-- CAPITAL SOCIAL: o que os socios puseram na empresa. Sem ele, TODO o patrimonio
-- liquido aparece como resultado acumulado, como se a empresa tivesse nascido do
-- nada e lucrado tudo.
--
-- NULL e "nao informou", que e diferente de zero informado. O conferente usa
-- essa diferenca para escolher a mensagem: falta cadastrar, ou o dinheiro acabou
-- mesmo.
ALTER TABLE "Tenant" ADD COLUMN "openingCash"  DECIMAL(12,2);
ALTER TABLE "Tenant" ADD COLUMN "shareCapital" DECIMAL(12,2);

-- ─── As linhas que vivem fora do sistema ────────────────────────────────────
--
-- Emprestimo, financiamento da van, imovel nao cadastrado, reserva de lucros.
--
-- GENERICA de proposito. A alternativa era um campo por tipo — `emprestimos`,
-- `bancos`, `outrosAtivos` — e o quarto tipo, quando aparecesse, seria
-- esquecido. Grupo + descricao + valor cresce sozinho, pela mesma razao que
-- `num_nonnulls(...) = 1` cresceu sozinha no anexo.
CREATE TYPE "BalanceGroup" AS ENUM (
  'ATIVO_CIRCULANTE',
  'ATIVO_NAO_CIRCULANTE',
  'PASSIVO_CIRCULANTE',
  'PASSIVO_NAO_CIRCULANTE',
  'PATRIMONIO_LIQUIDO'
);

CREATE TABLE "BalanceEntry" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "group"       "BalanceGroup" NOT NULL,
  "description" TEXT NOT NULL,
  -- Aceita NEGATIVO de proposito: conta retificadora existe. "(-) Provisao para
  -- devedores duvidosos" e linha legitima do ativo, e travar em zero obrigaria
  -- a empresa a mentir no balanco para caber na regra do sistema.
  "amount"      DECIMAL(14,2) NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BalanceEntry_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A tela le todas as linhas da empresa de uma vez, agrupadas.
CREATE INDEX "BalanceEntry_tenantId_group_idx" ON "BalanceEntry"("tenantId", "group");

-- Linha sem nome no balanco e linha que ninguem sabe o que e — e o contador
-- devolve perguntando.
ALTER TABLE "BalanceEntry" ADD CONSTRAINT "BalanceEntry_descricao_nao_vazia"
  CHECK (length(btrim("description")) > 0);

-- ─── As travas do que o sistema PASSA a guardar ─────────────────────────────
--
-- Caixa inicial negativo nao existe: se a empresa devia mais do que tinha no
-- primeiro dia, isso e passivo, e entra como linha manual.
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_caixa_inicial_nao_negativo"
  CHECK ("openingCash" IS NULL OR "openingCash" >= 0);

ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_capital_nao_negativo"
  CHECK ("shareCapital" IS NULL OR "shareCapital" >= 0);
