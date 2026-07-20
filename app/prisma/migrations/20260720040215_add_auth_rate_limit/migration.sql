-- Tabela de rate limiting para login/cadastro/recuperação de senha.
--
-- login/cadastro chamavam o Supabase Auth direto do browser — sem essa
-- tabela, um "rate limit" só em rota nossa não protegia nada, já que dava
-- pra bater direto na API do Supabase. Login e cadastro foram movidos pra
-- Server Actions que checam esta tabela (por IP e por e-mail) antes de
-- chamar o Supabase. Aplicado ao banco via `prisma db push` (ver seção 9
-- do PLANO_DE_ENGENHARIA.md sobre o drift de migrations deste projeto).
CREATE TABLE "AuthRateLimit" (
    "key" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthRateLimit_pkey" PRIMARY KEY ("key")
);
