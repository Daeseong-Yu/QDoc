ALTER TYPE "MapUsageType" ADD VALUE 'places_search';

ALTER TABLE "MapProviderConfig"
ADD COLUMN "monthlyPlacesSearchLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "MapProviderConfigAudit"
ADD COLUMN "monthlyPlacesSearchLimitBefore" INTEGER,
ADD COLUMN "monthlyPlacesSearchLimitAfter" INTEGER;

CREATE TABLE "MapSearchCache" (
    "id" TEXT NOT NULL,
    "provider" "MapProvider" NOT NULL,
    "queryKey" TEXT NOT NULL,
    "responseJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MapSearchCache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MapSearchCache_provider_queryKey_key" ON "MapSearchCache"("provider", "queryKey");
CREATE INDEX "MapSearchCache_expiresAt_idx" ON "MapSearchCache"("expiresAt");
