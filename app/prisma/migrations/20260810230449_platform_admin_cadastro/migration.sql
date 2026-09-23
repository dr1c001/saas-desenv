-- Dados de cadastro do administrador de plataforma.
-- Aditivo: tres colunas opcionais.

-- AlterTable
ALTER TABLE "PlatformAdmin" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "document" TEXT,
ADD COLUMN     "phone" TEXT;
