-- Recursos liberados individualmente, ALÉM do que o plano dá.
-- Ver o comentário em prisma/schema.prisma e lib/plan.ts.
-- Aditivo: uma coluna nova com default vazio, nenhum dado alterado.

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "extraFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[];
