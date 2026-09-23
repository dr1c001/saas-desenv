-- Registro das execucoes do cron.
--
-- Silencio e indistinguivel de sucesso: sem gravar, um cron que morreu ha tres
-- dias parece igual a um que rodou. E o estrago e invisivel — ninguem recebe
-- aviso de atraso, contrato recorrente nao gera OS.
--
-- /api/health le a ultima execucao boa e devolve 503 quando esta velha demais,
-- que e o que faz o monitor externo alertar.

CREATE TABLE "CronRun" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "ok" BOOLEAN NOT NULL DEFAULT false,
    "detail" TEXT,

    CONSTRAINT "CronRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CronRun_name_ok_startedAt_idx" ON "CronRun"("name", "ok", "startedAt");
