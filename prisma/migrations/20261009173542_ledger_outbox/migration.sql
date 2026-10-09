-- CreateEnum
CREATE TYPE "LedgerOutboxStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CONFLICT');

-- CreateTable
CREATE TABLE "ledger_outbox" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "documentId" TEXT,
    "signatureId" TEXT,
    "payload" TEXT NOT NULL,
    "status" "LedgerOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "txId" TEXT,
    "blockNumber" BIGINT,
    "onChainAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_mismatch" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "detail" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "ledger_mismatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_outbox_status_nextAttemptAt_idx" ON "ledger_outbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "ledger_outbox_documentId_idx" ON "ledger_outbox"("documentId");

-- CreateIndex
CREATE INDEX "ledger_outbox_signatureId_idx" ON "ledger_outbox"("signatureId");

-- CreateIndex
CREATE INDEX "ledger_mismatch_resolvedAt_idx" ON "ledger_mismatch"("resolvedAt");

-- CreateIndex
CREATE INDEX "ledger_mismatch_eventId_kind_idx" ON "ledger_mismatch"("eventId", "kind");
