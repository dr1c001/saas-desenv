-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('pt', 'en');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "locale" "Locale" NOT NULL DEFAULT 'pt';
