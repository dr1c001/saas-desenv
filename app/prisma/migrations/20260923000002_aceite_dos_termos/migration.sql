-- O ACEITE DOS TERMOS passa a existir fora do navegador.
--
-- Ate aqui o checkbox e a validacao do zod eram 100% do cliente, e o valor era
-- DESCARTADO no submit: `signUpUser` nunca recebeu o campo, e nao havia coluna
-- em lugar nenhum do schema. Como Server Action e endereco HTTP proprio, um
-- POST direto criava conta sem aceite — e nem havia onde mentir.
--
-- Enquanto isso os proprios Termos afirmam, na secao 1, que "ao criar uma conta
-- ou usar o sistema de qualquer forma, voce concorda com estes Termos", e na
-- secao 14 que "o uso continuado apos a alteracao implica concordancia com os
-- novos termos". A secao 14 nao exige re-aceite: exige saber QUAL VERSAO cada
-- conta aceitou, para conseguir dizer "isto mudou em relacao ao que voce
-- aceitou". Sem versao gravada, essa frase nao tinha como ser honrada.
--
-- SEM CHAVE ESTRANGEIRA, de proposito: a linha de "User" nao existe no momento
-- do cadastro — ela nasce preguicosamente no primeiro getTenant(), a partir do
-- user_metadata do Supabase. Uma FK tornaria impossivel gravar o aceite no
-- instante do ato de vontade, que e justamente o que se quer provar. Mesmo
-- desenho do escalar solto "Subscription"."acceptedByUserId".
--
-- Aditiva: tabela nova, nada existente e tocado.
CREATE TABLE IF NOT EXISTS "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedIp" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TermsAcceptance_userId_idx" ON "TermsAcceptance"("userId");
CREATE INDEX IF NOT EXISTS "TermsAcceptance_email_idx" ON "TermsAcceptance"("email");
