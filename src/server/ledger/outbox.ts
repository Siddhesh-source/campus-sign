import "server-only";
import { randomUUID } from "node:crypto";
import { canonical, validateEvent, type LedgerEventInput, type LedgerEventType } from "@ledger-core";
import type { Tx } from "../db";

export type LedgerEventDraft = {
  type: LedgerEventType;
  documentRef?: string;
  versionId?: string;
  versionNumber?: number;
  sha256?: string;
  signedSha256?: string;
  signerKeyId?: string;
  stepOrder?: number;
  totalSteps?: number;
  occurredAt?: Date;
  /** Local bookkeeping only (never sent on-chain). */
  signatureId?: string;
};

/**
 * Build the on-chain payload from an explicit allow-list. Names, emails, PRNs,
 * titles, comments, files and keys can't get in: there's no field for them,
 * and validateEvent() rejects anything else.
 */
export function toLedgerPayload(eventId: string, d: LedgerEventDraft): LedgerEventInput {
  return validateEvent(
    JSON.parse(
      canonical({
        eventId,
        type: d.type,
        documentRef: d.documentRef,
        versionId: d.versionId,
        versionNumber: d.versionNumber,
        sha256: d.sha256,
        signedSha256: d.signedSha256,
        signerKeyId: d.signerKeyId,
        stepOrder: d.stepOrder,
        totalSteps: d.totalSteps,
        occurredAt: (d.occurredAt ?? new Date()).toISOString(),
      }),
    ),
  );
}

/** Queue an event in the caller's transaction, so it exists iff the business change commits. */
export async function enqueueLedgerEvent(tx: Tx, d: LedgerEventDraft) {
  const id = randomUUID();
  const payload = toLedgerPayload(id, d);
  await tx.ledgerOutbox.create({
    data: { id, type: d.type, documentId: d.documentRef ?? null, signatureId: d.signatureId ?? null, payload: canonical(payload) },
  });
  return id;
}
