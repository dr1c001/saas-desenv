-- Setores de estoque: recebimento, produção e expedição.
--
-- ATENÇÃO — este arquivo contém SÓ os ALTER TYPE, e isso é obrigatório:
-- o Postgres não deixa USAR um valor de enum na mesma transação em que ele foi
-- acrescentado, e o Prisma roda cada arquivo de migration dentro de uma. Um
-- INSERT ou UPDATE que mencionasse 'EXPEDICAO' aqui faria a migration falhar
-- no deploy — e migration que falha no build da Vercel derruba a publicação.
--
-- Sem volta: o Postgres não remove valor de enum. Por isso entraram os três
-- setores pedidos, e nenhum "extra" por antecipação.

ALTER TYPE "StockLocationType" ADD VALUE IF NOT EXISTS 'RECEBIMENTO';
ALTER TYPE "StockLocationType" ADD VALUE IF NOT EXISTS 'PRODUCAO';
ALTER TYPE "StockLocationType" ADD VALUE IF NOT EXISTS 'EXPEDICAO';
