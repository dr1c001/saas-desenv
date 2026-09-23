-- Termos que a empresa escreve e que saem impressos nos documentos.
--
-- Garantia, condicoes de pagamento, prazo de validade, foro — cada ramo tem
-- os seus. Ate agora o sistema nao tinha onde guardar isso, e o texto ficava
-- na cabeca de quem atende ou colado a mao depois de imprimir.
--
-- Dois campos e nao um: garantia (na OS) e validade/pagamento (no orcamento)
-- sao textos diferentes.
ALTER TABLE "Tenant" ADD COLUMN "orderTerms" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "quoteTerms" TEXT;

-- Prazo de garantia escolhido pela empresa, com sobreposicao por OS.
-- Estruturado e nao texto: assim o PDF mostra a DATA em que a garantia
-- vence, calculada da conclusao — o cliente final ve uma data, nao uma
-- conta pra fazer.
ALTER TABLE "Tenant" ADD COLUMN "warrantyDays" INTEGER;
ALTER TABLE "ServiceOrder" ADD COLUMN "warrantyDays" INTEGER;
