-- Preferencias de notificacao, por PESSOA.
--
-- `mutedNotifications` guarda o que a pessoa SILENCIOU, e nao o que ela quer
-- receber. Lista vazia = recebe tudo = comportamento de hoje: ninguem deixa de
-- ser avisado no dia em que a tela de preferencias passa a existir. Mesma
-- razao do Tenant.disabledFeatures — uma lista de "desejados" comecaria vazia
-- e calaria o sistema para todo mundo.
--
-- `silentNotifications` e o UNICO controle de som que a web permite.
--
-- Escolher o TOQUE nao e possivel: a propriedade `sound` da API de notificacao
-- existiu num rascunho antigo e foi REMOVIDA — nenhum navegador implementa. No
-- Android o som vem do canal de notificacao, que pertence ao sistema
-- operacional; no iPhone, do som padrao. Um site nao toca arquivo proprio.
-- Quem troca o toque e a pessoa, nas configuracoes do aparelho. Uma tela
-- oferecendo "escolha seu toque" seria uma tela que nao funciona.

ALTER TABLE "User" ADD COLUMN "mutedNotifications" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "User" ADD COLUMN "silentNotifications" BOOLEAN NOT NULL DEFAULT false;
