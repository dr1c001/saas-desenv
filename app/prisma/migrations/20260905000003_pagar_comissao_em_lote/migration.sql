-- Pagar todas as comissões de uma pessoa de uma vez.
--
-- Hoje o botão Pagar é por linha. Quatro técnicos com vinte OS são oitenta
-- cliques no fechamento do mês: no primeiro mês o dono faz, no segundo ele volta
-- para o caderno — e o recurso morre funcionando.
--
-- É opção da empresa porque um clique passa a mover muito dinheiro de uma vez, e
-- quem prefere conferir OS a OS tem motivo. Ligado por padrão: desligado, quase
-- ninguém encontraria a opção, e o problema dos oitenta cliques continuaria de
-- pé para todo mundo.

ALTER TABLE "Tenant" ADD COLUMN "commissionBulkPay" BOOLEAN NOT NULL DEFAULT true;
