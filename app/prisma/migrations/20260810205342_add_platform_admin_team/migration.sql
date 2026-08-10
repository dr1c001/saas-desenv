-- Equipe de administracao da plataforma (ver o comentario do model).
-- Aditivo: enum e tabela novos, nenhum dado existente alterado.

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('DONO', 'FINANCEIRO', 'COMERCIAL', 'LOGISTICO', 'TI');

-- CreateTable
CREATE TABLE "PlatformAdmin" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "PlatformRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "invitedBy" TEXT,
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformAdmin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdmin_email_key" ON "PlatformAdmin"("email");

-- CreateIndex
CREATE INDEX "PlatformAdmin_email_active_idx" ON "PlatformAdmin"("email", "active");
