-- O aviso ao DONO DA PLATAFORMA, e a garantia de que ele sai UMA VEZ SO.
--
-- Esta tabela nao guarda dado de negocio: ela guarda a REIVINDICACAO de que um
-- fato ja foi avisado. A linha e criada ANTES do envio, e o indice unico e o
-- que impede o aviso repetido — nao um `if` no codigo.
--
-- Isso importa porque as duas origens repetem por natureza: o webhook do Asaas
-- reenvia o mesmo evento, e o primeiro login tem corrida conhecida entre
-- Server Components. Um `if` perderia as duas.

CREATE TABLE "PlatformAlert" (
    "id"        TEXT NOT NULL,
    -- novaEmpresa:<tenantId> · atraso:<subId>:<fimDoPeriodo> · cancelamento:<subId>
    --
    -- Atraso e cancelamento tem chaves DIFERENTES de proposito. Com uma chave
    -- por empresa, o cancelamento — que chega depois — encontraria a linha do
    -- atraso e seria engolido: o dono saberia que o cliente atrasou e nunca que
    -- ele foi embora, que e a metade que importa.
    --
    -- O atraso carrega o fim do periodo porque se repete de mes em mes; o
    -- cancelamento acontece uma vez so.
    "key"       TEXT NOT NULL,
    "event"     TEXT NOT NULL,
    -- SEM chave estrangeira, de proposito: o registro precisa sobreviver ao
    -- apagarEmpresaAbandonada, pelo mesmo motivo do AdminAuditLog.
    "tenantId"  TEXT,
    -- O corpo exato que saiu, para responder depois "o que o aviso dizia".
    "detail"    TEXT,
    -- Quantos aparelhos receberam.
    --
    -- ZERO com a linha presente = o gatilho disparou e o push nao chegou.
    -- Linha AUSENTE = o gatilho nunca rodou. Sem essa diferenca, os dois casos
    -- parecem o mesmo na hora de descobrir por que ninguem foi avisado.
    "delivered" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlatformAlert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformAlert_key_key" ON "PlatformAlert"("key");
CREATE INDEX "PlatformAlert_createdAt_idx" ON "PlatformAlert"("createdAt");
