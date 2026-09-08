-- Chave da API de integracao. Recurso do plano Enterprise.
--
-- O banco guarda o HASH, nunca a chave. Chave de API e uma senha que a empresa
-- cola num sistema de terceiro — o site dela, o ERP, uma automacao — e vai
-- parar em arquivo de configuracao e em backup. Guardando so o hash, um
-- vazamento do banco nao vira uma pilha de credenciais validas.
--
-- `prefix` e a parte publica da chave e existe para achar a linha por indice:
-- sem ele, conferir uma chave exigiria carregar TODAS as chaves de TODAS as
-- empresas e testar o hash uma a uma. Formato em lib/api-chave.ts.

CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApiKey_prefix_key" ON "ApiKey"("prefix");

CREATE INDEX "ApiKey_tenantId_idx" ON "ApiKey"("tenantId");

ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
