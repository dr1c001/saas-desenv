-- Retrato mensal do negocio (ver o comentario do model em schema.prisma).
-- Aditivo: cria uma tabela nova, nao toca em dado existente.

-- CreateTable
CREATE TABLE "MonthlySnapshot" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "companies" INTEGER NOT NULL,
    "activeCompanies" INTEGER NOT NULL,
    "pendingCompanies" INTEGER NOT NULL,
    "pastDueCompanies" INTEGER NOT NULL,
    "cancelledCompanies" INTEGER NOT NULL,
    "users" INTEGER NOT NULL,
    "payingUsers" INTEGER NOT NULL,
    "mrr" DECIMAL(12,2) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MonthlySnapshot_month_key" ON "MonthlySnapshot"("month");

-- CreateIndex
CREATE INDEX "MonthlySnapshot_month_idx" ON "MonthlySnapshot"("month");
