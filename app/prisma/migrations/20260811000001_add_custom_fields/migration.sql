
-- CreateEnum
CREATE TYPE "CustomFieldEntity" AS ENUM ('CLIENT', 'SERVICE_ORDER');

-- CreateEnum
CREATE TYPE "CustomFieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "customValues" JSONB;

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "customValues" JSONB;

-- CreateTable
CREATE TABLE "CustomField" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entity" "CustomFieldEntity" NOT NULL,
    "label" TEXT NOT NULL,
    "type" "CustomFieldType" NOT NULL DEFAULT 'TEXT',
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "required" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomField_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomField_tenantId_entity_position_idx" ON "CustomField"("tenantId", "entity", "position");

-- AddForeignKey
ALTER TABLE "CustomField" ADD CONSTRAINT "CustomField_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

