-- Permissao por ACAO, um degrau abaixo da permissao por aba.
--
-- Ate aqui o acesso era por aba: quem enxerga "Ordens de Servico" faz tudo
-- dentro dela. O caso que motivou descer um degrau:
--
--   updateServiceOrder reescreve os ITENS e o VALOR TOTAL da OS, e nao tinha
--   checagem de papel nenhuma. Qualquer tecnico com a aba mudava o preco de um
--   servico ja executado.
--
-- Catalogo das acoes em lib/acoes.ts (modulo puro).

CREATE TABLE "ActionPermission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "ActionPermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActionPermission_tenantId_role_action_key" ON "ActionPermission"("tenantId", "role", "action");

ALTER TABLE "ActionPermission" ADD CONSTRAINT "ActionPermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Separam "nunca mexeram nisso" de "mexeram e nao liberaram nada".
--
-- Sem esse sinal a lista vazia tem dois significados opostos, e o sistema
-- escolhe o errado. Era o caso real da permissao por ABA: desmarcar as 19
-- caixas gravava zero linhas, e zero linhas era lido como "usar o padrao" —
-- que concede 3 abas. A tela prometia acesso nenhum e o codigo dava tres.
--
-- Nascem FALSE para todo mundo, e a leitura continua caindo no padrao enquanto
-- houver zero linhas gravadas. Ou seja: quem ja configurou abas nao perde nada,
-- e quem nunca configurou tambem nao. Ver lib/auth.ts.
ALTER TABLE "Tenant" ADD COLUMN "tabsConfigured" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Tenant" ADD COLUMN "actionsConfigured" BOOLEAN NOT NULL DEFAULT false;

-- Quem JA tem permissao de aba gravada configurou de verdade, mesmo que antes
-- do sinal existir. Marcar agora evita que uma futura leitura por
-- tabsConfigured desfaca a escolha dessas empresas.
UPDATE "Tenant" SET "tabsConfigured" = true
WHERE "id" IN (SELECT DISTINCT "tenantId" FROM "TabPermission");
