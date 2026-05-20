-- CreateEnum
CREATE TYPE "MapProvider" AS ENUM ('mapbox', 'google');

-- CreateEnum
CREATE TYPE "MapUsageType" AS ENUM ('map_load');

-- AlterTable
ALTER TABLE "Site"
ADD COLUMN "addressLine1" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "region" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "country" TEXT,
ADD COLUMN "latitude" DOUBLE PRECISION,
ADD COLUMN "longitude" DOUBLE PRECISION,
ADD COLUMN "locationSource" TEXT,
ADD COLUMN "locationVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MapProviderConfig" (
    "id" TEXT NOT NULL,
    "provider" "MapProvider" NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "monthlyMapLoadLimit" INTEGER NOT NULL DEFAULT 0,
    "hardStopEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapProviderConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapUsagePeriod" (
    "id" TEXT NOT NULL,
    "provider" "MapProvider" NOT NULL,
    "usageType" "MapUsageType" NOT NULL DEFAULT 'map_load',
    "periodStart" TIMESTAMP(3) NOT NULL,
    "limit" INTEGER NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "hardStoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapUsagePeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MapProviderConfigAudit" (
    "id" TEXT NOT NULL,
    "provider" "MapProvider" NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "isEnabledBefore" BOOLEAN,
    "isEnabledAfter" BOOLEAN,
    "monthlyMapLoadLimitBefore" INTEGER,
    "monthlyMapLoadLimitAfter" INTEGER,
    "hardStopEnabledBefore" BOOLEAN,
    "hardStopEnabledAfter" BOOLEAN,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MapProviderConfigAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MapProviderConfig_provider_key" ON "MapProviderConfig"("provider");

-- CreateIndex
CREATE INDEX "MapProviderConfigAudit_provider_createdAt_idx" ON "MapProviderConfigAudit"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "MapProviderConfigAudit_actorId_createdAt_idx" ON "MapProviderConfigAudit"("actorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MapUsagePeriod_provider_usageType_periodStart_key" ON "MapUsagePeriod"("provider", "usageType", "periodStart");

-- CreateIndex
CREATE INDEX "MapUsagePeriod_provider_usageType_periodStart_idx" ON "MapUsagePeriod"("provider", "usageType", "periodStart");
