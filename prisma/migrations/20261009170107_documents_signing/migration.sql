-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'CORRECTIONS_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentEventType" AS ENUM ('CREATED', 'VERSION_UPLOADED', 'SUBMITTED', 'REVIEW_STARTED', 'CORRECTIONS_REQUESTED', 'REJECTED', 'APPROVED_SIGNED');

-- CreateEnum
CREATE TYPE "CredentialStatus" AS ENUM ('ACTIVE', 'ROTATED', 'REVOKED');

-- CreateTable
CREATE TABLE "document_type" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "document_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_version" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "document_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_event" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "type" "DocumentEventType" NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signing_credential" (
    "id" TEXT NOT NULL,
    "facultyId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "publicKeyPem" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "status" "CredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "signing_credential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "originalSha256" TEXT NOT NULL,
    "signedSha256" TEXT NOT NULL,
    "signedStorageKey" TEXT NOT NULL,
    "signedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "signature_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_type_code_key" ON "document_type"("code");

-- CreateIndex
CREATE UNIQUE INDEX "document_currentVersionId_key" ON "document"("currentVersionId");

-- CreateIndex
CREATE INDEX "document_studentId_updatedAt_idx" ON "document"("studentId", "updatedAt");

-- CreateIndex
CREATE INDEX "document_classId_status_idx" ON "document"("classId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "document_version_storageKey_key" ON "document_version"("storageKey");

-- CreateIndex
CREATE INDEX "document_version_sha256_idx" ON "document_version"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "document_version_documentId_number_key" ON "document_version"("documentId", "number");

-- CreateIndex
CREATE INDEX "document_event_documentId_createdAt_idx" ON "document_event"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "signing_credential_keyId_key" ON "signing_credential"("keyId");

-- CreateIndex
CREATE INDEX "signing_credential_facultyId_status_idx" ON "signing_credential"("facultyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "signature_code_key" ON "signature"("code");

-- CreateIndex
CREATE UNIQUE INDEX "signature_signedSha256_key" ON "signature"("signedSha256");

-- CreateIndex
CREATE UNIQUE INDEX "signature_signedStorageKey_key" ON "signature"("signedStorageKey");

-- CreateIndex
CREATE INDEX "signature_originalSha256_idx" ON "signature"("originalSha256");

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_classId_fkey" FOREIGN KEY ("classId") REFERENCES "class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "document_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document" ADD CONSTRAINT "document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "document_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_version" ADD CONSTRAINT "document_version_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_event" ADD CONSTRAINT "document_event_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_event" ADD CONSTRAINT "document_event_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "document_version"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signing_credential" ADD CONSTRAINT "signing_credential_facultyId_fkey" FOREIGN KEY ("facultyId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature" ADD CONSTRAINT "signature_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature" ADD CONSTRAINT "signature_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature" ADD CONSTRAINT "signature_credentialId_fkey" FOREIGN KEY ("credentialId") REFERENCES "signing_credential"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One ACTIVE signing credential per faculty member.
CREATE UNIQUE INDEX "signing_credential_one_active" ON "signing_credential"("facultyId") WHERE "status" = 'ACTIVE';

-- Signatures and document history are append-only.
CREATE TRIGGER signature_no_update_delete BEFORE UPDATE OR DELETE ON "signature"
  FOR EACH ROW EXECUTE FUNCTION audit_event_immutable();
CREATE TRIGGER document_event_no_update_delete BEFORE UPDATE OR DELETE ON "document_event"
  FOR EACH ROW EXECUTE FUNCTION audit_event_immutable();

-- Locked (submitted) versions can't be modified or deleted.
CREATE OR REPLACE FUNCTION document_version_locked() RETURNS trigger AS $$
BEGIN
  IF OLD."submittedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'document_version % is locked', OLD."id" USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER document_version_lock BEFORE UPDATE OR DELETE ON "document_version"
  FOR EACH ROW EXECUTE FUNCTION document_version_locked();

INSERT INTO "document_type" ("id","code","name") VALUES
  ('dt_assignment','ASSIGNMENT','Assignment'),
  ('dt_lab_report','LAB_REPORT','Lab report'),
  ('dt_project_report','PROJECT_REPORT','Project report'),
  ('dt_internship_report','INTERNSHIP_REPORT','Internship report'),
  ('dt_leave_application','LEAVE_APPLICATION','Leave application'),
  ('dt_bonafide_request','BONAFIDE_REQUEST','Bonafide certificate request'),
  ('dt_no_dues','NO_DUES','No-dues form'),
  ('dt_other','OTHER','Other academic document');
