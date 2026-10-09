-- CreateEnum
CREATE TYPE "ApproverKind" AS ENUM ('CLASS_FACULTY', 'DESIGNATED');

-- AlterTable
ALTER TABLE "document" ADD COLUMN     "approverEmails" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "currentStep" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "routeSnapshot" JSONB;

-- AlterTable
ALTER TABLE "document_event" ADD COLUMN     "step" INTEGER;

-- AlterTable
ALTER TABLE "signature" ADD COLUMN     "previousSignatureId" TEXT,
ADD COLUMN     "stepOrder" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "totalSteps" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "approval_step" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "ApproverKind" NOT NULL,
    "approverEmail" TEXT,

    CONSTRAINT "approval_step_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "approval_step_typeId_order_key" ON "approval_step"("typeId", "order");

-- AddForeignKey
ALTER TABLE "approval_step" ADD CONSTRAINT "approval_step_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "document_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;
