-- Lote de geocodificacao aguardando resultado do provedor.
-- Guardar o job e o que impede um lote demorado de ser abandonado e reenviado
-- todo dia para sempre — com o mapa nunca enchendo e ninguem sendo avisado.
CREATE TABLE "GeocodeBatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "addressIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeocodeBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GeocodeBatch_jobId_key" ON "GeocodeBatch"("jobId");

-- Contador de tentativas de geocodificacao.
-- Sem ele, endereco que nunca resolve ocupa as vagas da fila para sempre e
-- endereco novo nunca chega a ser processado — o mapa para de encher em
-- silencio.
ALTER TABLE "Address" ADD COLUMN "geocodeTries" INTEGER NOT NULL DEFAULT 0;

-- A fila busca: where latitude is null + geocodeTries < teto,
-- order by geocodeTries, id
CREATE INDEX "Address_geocodeTries_idx" ON "Address"("geocodeTries");
