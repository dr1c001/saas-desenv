-- Saida antecipada do painel de primeiros passos.
-- Data em vez de booleano: a pergunta que interessa depois nao e "fechou?" e
-- sim "ha quanto tempo" — abandono no inicio e justamente o que esse painel
-- existe pra combater.
ALTER TABLE "Tenant" ADD COLUMN "onboardingDismissedAt" TIMESTAMP(3);
