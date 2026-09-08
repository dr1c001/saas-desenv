-- Regua de cobranca: lembrar antes de vencer, cobrar depois de vencido.
--
-- Hoje alguem precisa olhar a lista de contas vencidas e mandar mensagem uma
-- por uma. Quase ninguem faz — e a conta que ninguem cobra e a conta que
-- ninguem paga. A regra esta em lib/regua-cobranca.ts, testada la; aqui fica
-- so o estado que ela precisa guardar.

-- ─── A configuracao, por empresa ─────────────────────────────────────────────
--
-- NULL de proposito, e nao um padrao ligado: esta e a unica automacao do
-- sistema que manda mensagem de COBRANCA, em nome da empresa, para o celular
-- de terceiros. Errar aqui e constranger um cliente que ja pagou, ou cobrar
-- quem nunca autorizou receber mensagem. Quem responde por isso e a empresa —
-- entao e ela que liga.
--
-- Coluna SEPARADA de clientNotifications de proposito, e nao mais um campo
-- dentro daquele JSON: sao dois consentimentos diferentes. Querer avisar o
-- cliente que o tecnico esta a caminho nao e querer cobrar o cliente por
-- WhatsApp, e juntar as duas coisas faria ligar uma ligar a outra.
--
-- Formato em lib/regua-cobranca.ts (ConfigRegua).
ALTER TABLE "Tenant" ADD COLUMN "dunningConfig" JSONB;

-- ─── O contador, por receita ─────────────────────────────────────────────────
--
-- Quantos DEGRAUS da regua ja passaram para esta conta. Um contador em vez de
-- "data do ultimo aviso" pela mesma razao de Subscription.pastDueWarningsSent:
-- o cron roda uma vez por dia e pode falhar num dia. Se a regra fosse "hoje e
-- exatamente o 7o dia?", o degrau perdido nunca mais voltaria — a conta
-- pularia do 1o para o 15o e ninguem perceberia, porque a falha e silenciosa.
--
-- Contando degraus e comparando com quantos ja sairam, um dia perdido se
-- recupera sozinho no dia seguinte.
--
-- Comeca em 0 para todo mundo, inclusive para as contas que ja existem e ja
-- estao vencidas ha meses. Isso e deliberado: a regua manda UM degrau por dia,
-- o mais recente — entao uma carteira antiga recebe uma mensagem por conta, e
-- nao a escada inteira de uma vez. Ver o teste "uma conta que nasce ja vencida
-- nao dispara a regua toda de uma vez".
ALTER TABLE "Revenue" ADD COLUMN "remindersSent" INTEGER NOT NULL DEFAULT 0;

-- Contador nao pode ser negativo: `DEGRAUS[total - 1]` com total negativo
-- devolveria undefined e a mensagem sairia sem degrau.
ALTER TABLE "Revenue" ADD CONSTRAINT "Revenue_remindersSent_nao_negativo"
  CHECK ("remindersSent" >= 0);
