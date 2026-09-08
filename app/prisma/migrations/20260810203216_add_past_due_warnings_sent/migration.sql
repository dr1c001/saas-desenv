-- Contador de avisos de cobranca em atraso ja enviados no ciclo vencido.
-- Ver o comentario do campo em schema.prisma e o cron em api/cron/daily.
-- Aditivo: coluna nova com default 0, nenhum dado alterado.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "pastDueWarningsSent" INTEGER NOT NULL DEFAULT 0;
