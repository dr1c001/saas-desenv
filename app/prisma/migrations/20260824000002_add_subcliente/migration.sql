-- Subcliente: quem contrata nao e quem recebe o servico.
--
-- O caso: uma administradora de condominios fecha contrato com a empresa, mas
-- o servico e feito em cada condominio. Vale igual para seguradora e segurado,
-- rede de franquias e cada loja, construtora e cada obra.
--
-- Ate aqui o sistema respondia com um campo so as duas perguntas, porque elas
-- tinham sempre a mesma resposta:
--
--   ONDE o servico acontece?  -> ServiceOrder.clientId
--   QUEM paga por ele?        -> o mesmo clientId
--
-- Separa-las e o que permite a nota fiscal sair no CNPJ certo.

-- O contratante deste cliente. NULL = cliente normal, que e o caso de todos os
-- que ja existem — nada muda para eles.
--
-- ON DELETE SET NULL, e nao CASCADE: apagar a administradora NAO pode levar
-- junto trinta condominios com historico de servico, receita e nota fiscal
-- emitida. Eles viram clientes normais, e alguem decide o que fazer.
ALTER TABLE "Client" ADD COLUMN "parentId" TEXT;
ALTER TABLE "Client" ADD CONSTRAINT "Client_parentId_fkey"
  FOREIGN KEY ("parentId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Buscar "os subclientes de X" e a consulta da tela de cliente e da lista.
CREATE INDEX "Client_tenantId_parentId_idx" ON "Client"("tenantId", "parentId");

-- Quem paga por ESTA ordem de servico.
--
-- NULL = o padrao, que e o contratante quando existe e o proprio cliente
-- quando nao. O campo existe porque a administradora paga quase tudo, mas as
-- vezes o condominio paga direto um servico extra — e forcar tudo para o
-- contratante faria a empresa emitir nota errada justamente no caso
-- excepcional, que e quando alguem repara.
--
-- Regra do que pode ser gravado aqui em lib/subcliente.ts: so o proprio
-- cliente da OS ou o contratante dele. Um id qualquer cairia no padrao.
ALTER TABLE "ServiceOrder" ADD COLUMN "payerId" TEXT;
ALTER TABLE "ServiceOrder" ADD CONSTRAINT "ServiceOrder_payerId_fkey"
  FOREIGN KEY ("payerId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
