-- Historico de alteracao da ordem de servico.
--
-- Ate aqui existia log de auditoria do painel da plataforma, mas NENHUM dos
-- dados do cliente: quando aparecia discussao sobre valor, status ou
-- responsavel, nao havia como saber quem mudou o que nem quando.
--
-- actorName e TEXTO de proposito: o registro precisa continuar legivel depois
-- que a pessoa sai da empresa.

CREATE TYPE "OrderEventType" AS ENUM ('CRIADA', 'STATUS', 'RESPONSAVEL', 'AGENDAMENTO', 'VALOR', 'CONCLUSAO', 'GARANTIA');

CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "OrderEventType" NOT NULL,
    "actorName" TEXT,
    "actorId" TEXT,
    "before" TEXT,
    "after" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

CREATE INDEX "OrderEvent_tenantId_createdAt_idx" ON "OrderEvent"("tenantId", "createdAt");

ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
