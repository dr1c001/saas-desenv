-- Cargos de verdade, alem de OWNER/ADMIN/TECHNICIAN.
--
-- Ate aqui o enum descrevia NIVEL DE ACESSO, nao funcao. Uma empresa tem
-- atendimento, financeiro, logistica, gerente — e todos caiam em "tecnico",
-- enxergando exatamente a mesma coisa.
--
-- Isto funciona sem reescrever permissao porque TabPermission e
-- ActionPermission SEMPRE tiveram chave (tenantId, role, ...): o sistema ja
-- sabia guardar permissao por papel, so nunca existiu mais de um configuravel.
--
-- ADD VALUE fora de bloco explicito: o Postgres 12+ aceita dentro da transacao
-- da migration desde que o valor novo nao seja USADO na mesma transacao. Aqui
-- so declaramos; nenhuma linha recebe os cargos novos agora.
ALTER TYPE "UserRole" ADD VALUE 'GERENTE';
ALTER TYPE "UserRole" ADD VALUE 'ATENDIMENTO';
ALTER TYPE "UserRole" ADD VALUE 'COMERCIAL';
ALTER TYPE "UserRole" ADD VALUE 'FINANCEIRO';
ALTER TYPE "UserRole" ADD VALUE 'LOGISTICA';

-- "Ja configuraram isto?" passa a ser POR CARGO.
--
-- Era um booleano para a empresa inteira, e com um cargo configuravel so isso
-- bastava. Com varios, o booleano cria um defeito silencioso: o dono configura
-- as abas do TECNICO, a flag vira true, e a partir dai o FINANCEIRO passa a ler
-- "ja configuraram" com zero linhas gravadas — ou seja, menu vazio, sem
-- ninguem ter mexido no cargo dele.
--
-- Guardar QUAIS cargos foram configurados resolve, e mantem a distincao que ja
-- existia entre "nunca mexeram" e "mexeram e nao deram nada", que e o que
-- impede o padrao de voltar por cima de uma decisao deliberada.
ALTER TABLE "Tenant" ADD COLUMN "tabsConfiguredRoles" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "Tenant" ADD COLUMN "actionsConfiguredRoles" TEXT[] NOT NULL DEFAULT '{}';

-- Backfill: quem ja tinha configurado, configurou o TECNICO — era o unico
-- cargo que a tela oferecia. Sem isto, toda empresa que ja restringiu seus
-- tecnicos os veria voltar ao padrao no proximo carregamento.
UPDATE "Tenant" SET "tabsConfiguredRoles" = ARRAY['TECHNICIAN'] WHERE "tabsConfigured" = true;
UPDATE "Tenant" SET "actionsConfiguredRoles" = ARRAY['TECHNICIAN'] WHERE "actionsConfigured" = true;
