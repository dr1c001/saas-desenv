-- A TROCA DE PLANO pelo painel.
--
-- O manual prometia "troca de plano" desde sempre, e a Action recusava
-- qualquer assinatura nova enquanto existisse uma em andamento — com o
-- comentario dizendo "troca de plano nao e suportada ainda, precisa cancelar
-- antes". A tela, enquanto isso, mostrava os botoes de Assinar em TODOS os
-- planos: o cliente clicava e recebia erro. E o caminho que o erro mandava
-- tomar (cancelar e reassinar) derruba a equipe inteira em /expired ate o
-- pagamento novo ser confirmado.
--
-- `pendingPlanId` existe por causa do DOWNGRADE: descer de plano vale so no
-- fim do periodo ja pago, porque o contrato garante o que foi pago. Subir vale
-- na hora e nao precisa de agendamento.
--
-- (Achado na auditoria de 13/09/2026, verbete 3.5 do manual.)
ALTER TABLE "Subscription" ADD COLUMN "pendingPlanId" TEXT;
CREATE INDEX "Subscription_pendingPlanId_idx" ON "Subscription"("pendingPlanId");
