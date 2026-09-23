-- Tetos e preco ajustados POR EMPRESA, por cima do que o plano da.
--
-- Existem porque os planos sao tres e as empresas nao: sempre aparece a que
-- precisa de 12 usuarios mas nao quer o Enterprise, ou a que quer 30 notas por
-- mes em vez de 8. Ate aqui a unica saida era trocar o plano dela — o que muda
-- o preco e todo o resto junto.
--
-- NULL = herda do plano · 0 = SEM LIMITE · outro numero = o teto dela.
--
-- Os dois primeiros seriam o mesmo NULL num campo comum, e sao coisas
-- diferentes: "herdar" acompanha o plano quando ele mudar, "sem limite" nao.
-- Confundir custa dos dois lados — a empresa marcada como ilimitada que na
-- verdade so herdava e barrada no dia em que o plano aperta; a marcada como
-- herdando que era ilimitada perde o combinado sem ninguem tocar na conta dela.
--
-- Zero carrega o sentido de ilimitado porque zero usuario, zero OS ou zero nota
-- nao significa nada como teto real. Regra e testes em lib/limite.ts.
--
-- Todas nascem NULL: nenhuma empresa muda de comportamento com esta migration.

ALTER TABLE "Tenant" ADD COLUMN "maxUsersOverride" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "maxOrdersOverride" INTEGER;
ALTER TABLE "Tenant" ADD COLUMN "maxNfseOverride" INTEGER;

-- Mensalidade combinada, quando difere da do plano. NULL = cobra a do plano.
-- Serve ao plano customizado: recursos e tetos proprios pedem preco proprio.
ALTER TABLE "Tenant" ADD COLUMN "customPriceMonthly" DECIMAL(10,2);
