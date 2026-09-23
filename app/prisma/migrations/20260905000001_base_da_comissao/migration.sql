-- Sobre o que a comissão incide: o total da OS, ou só a mão de obra.
--
-- Numa OS de R$ 1.200 com R$ 1.000 de compressor e R$ 200 de mão de obra,
-- comissionar o total paga R$ 100 sobre uma peça que o técnico só carregou.
-- Para quem vende serviço com pouca peça isso é irrelevante; para quem revende,
-- é a diferença entre a comissão e o lucro.
--
-- O padrão é TOTAL: é o comportamento que já existe, e nenhuma empresa deve
-- acordar com a comissão de todo mundo mudando de valor sem ela ter pedido.

ALTER TABLE "Tenant" ADD COLUMN "commissionBase" TEXT NOT NULL DEFAULT 'TOTAL';

-- Texto com CHECK, e não enum do Postgres: enum não aceita remover nem
-- reordenar valor, e esta lista ainda pode crescer (comissão sobre margem, por
-- exemplo). A trava mora no banco porque a Action não é o único caminho até a
-- coluna — e um valor desconhecido aqui faria a comissão da empresa inteira
-- cair para zero em silêncio.
ALTER TABLE "Tenant"
  ADD CONSTRAINT "Tenant_commissionBase_valida"
  CHECK ("commissionBase" IN ('TOTAL', 'MAO_DE_OBRA'));
