-- Franquia mensal de comandos da assistente de voz, ajustada POR EMPRESA.
--
-- A assistente e vendida como ADICIONAL, e nao dentro de um plano, porque ela
-- tem CUSTO POR USO: cada comando consome API paga. Num plano de preco fixo, o
-- cliente que mais fala com ela seria o que menos da lucro — e nao ha como
-- prever qual vai ser.
--
-- Mesma gramatica dos outros ajustes (lib/limite.ts):
--   NULL = herda o padrao · 0 = SEM LIMITE · outro numero = o teto dela
--
-- A diferenca em relacao a maxNfseOverride: nota fiscal tem teto vindo do
-- plano, e "herdar" pega esse teto. Aqui nenhum plano inclui a assistente,
-- entao NULL herda a franquia padrao de IA_COMANDOS_PADRAO (lib/recursos.ts).
-- Sem esse padrao, conceder o adicional daria "liberado, com zero comandos" —
-- que parece defeito, e nao decisao.
ALTER TABLE "Tenant" ADD COLUMN "maxIaOverride" INTEGER;

-- Quantos comandos ja foram gastos, e quando a contagem virou.
--
-- Contador no proprio Tenant, e nao uma tabela de eventos: o que a cobranca
-- precisa saber e "quantos neste mes", e guardar uma linha por comando so para
-- responder isso cresceria sem limite por um numero que cabe numa coluna. Quem
-- precisar auditar comando a comando tem os registros da propria API.
ALTER TABLE "Tenant" ADD COLUMN "iaComandosNoMes" INTEGER NOT NULL DEFAULT 0;

-- O mes a que o contador se refere, como AAAA-MM no fuso de Brasilia.
--
-- Texto, e nao data: a virada e por MES CIVIL brasileiro, e guardar um
-- timestamp obrigaria a converter fuso toda vez que se compara. Comparar
-- "2026-08" com "2026-08" nao tem fuso para errar.
ALTER TABLE "Tenant" ADD COLUMN "iaMesDoContador" TEXT;
