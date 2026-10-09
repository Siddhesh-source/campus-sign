import "server-only";
import { canonical, inputOf } from "@ledger-core";
import { db } from "../db";
import { getLedger, ledgerMode } from "./client";

export type LedgerState =
  | "CONFIRMED" // on-chain and identical to our record
  | "PENDING" // queued / retrying, not yet on-chain
  | "MISMATCH" // on-chain record differs, is missing, or conflicted
  | "UNAVAILABLE" // couldn't reach the ledger to check
  | "OFF"; // ledger layer disabled on this server

export type LedgerCheck = {
  state: LedgerState;
  eventId?: string;
  txId?: string | null;
  blockNumber?: string | null;
  onChainAt?: Date | null;
  attempts?: number;
  keyRevokedOnChain?: boolean;
};

/**
 * Live check of the APPROVED event for a signature against the chain.
 * "CONFIRMED" requires: outbox CONFIRMED + the event readable on-chain by the
 * signed hash + identical payload. Anything less is not "fully verified".
 */
export async function checkApprovalOnLedger(signatureId: string, signedSha256: string, signerKeyId: string): Promise<LedgerCheck> {
  const row = await db.ledgerOutbox.findFirst({ where: { signatureId, type: "APPROVED" } });
  if (!row) return { state: "MISMATCH" };
  const base = { eventId: row.id, txId: row.txId, blockNumber: row.blockNumber?.toString() ?? null, onChainAt: row.onChainAt, attempts: row.attempts };
  if (row.status === "CONFLICT") return { ...base, state: "MISMATCH" };
  const ledger = await getLedger().catch(() => undefined); // undefined = configured but unreachable
  if (ledger === null) return { ...base, state: row.status === "CONFIRMED" ? "UNAVAILABLE" : "OFF" };
  if (row.status !== "CONFIRMED") return { ...base, state: "PENDING" };
  if (!ledger) return { ...base, state: "UNAVAILABLE" };

  try {
    const [byHash, byKey] = await Promise.all([ledger.getByHash(signedSha256), ledger.getByKey(signerKeyId)]);
    const onChain = byHash.find((e) => e.eventId === row.id && e.type === "APPROVED");
    const keyRevokedOnChain = byKey.some((e) => e.type === "KEY_REVOKED");
    if (!onChain || canonical(inputOf(onChain)) !== row.payload) return { ...base, state: "MISMATCH", keyRevokedOnChain };
    return { ...base, state: "CONFIRMED", txId: onChain.txId, onChainAt: new Date(onChain.txTimestamp), keyRevokedOnChain };
  } catch {
    return { ...base, state: "UNAVAILABLE" };
  }
}

export type DocumentLedgerRow = {
  id: string;
  type: string;
  status: "PENDING" | "CONFIRMED" | "CONFLICT";
  attempts: number;
  txId: string | null;
  blockNumber: string | null;
  createdAt: Date;
  confirmedAt: Date | null;
  lastError: string | null;
};

/** Local view of every ledger event for a document (for the document/review pages). */
export async function documentLedgerRows(documentId: string): Promise<DocumentLedgerRow[]> {
  const rows = await db.ledgerOutbox.findMany({ where: { documentId }, orderBy: { createdAt: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    attempts: r.attempts,
    txId: r.txId,
    blockNumber: r.blockNumber?.toString() ?? null,
    createdAt: r.createdAt,
    confirmedAt: r.confirmedAt,
    lastError: r.lastError,
  }));
}

export async function ledgerOverview() {
  const [pending, confirmed, conflict, mismatches, oldestPending] = await Promise.all([
    db.ledgerOutbox.count({ where: { status: "PENDING" } }),
    db.ledgerOutbox.count({ where: { status: "CONFIRMED" } }),
    db.ledgerOutbox.count({ where: { status: "CONFLICT" } }),
    db.ledgerMismatch.findMany({ where: { resolvedAt: null }, orderBy: { detectedAt: "desc" }, take: 50 }),
    db.ledgerOutbox.findFirst({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" } }),
  ]);
  const recent = await db.ledgerOutbox.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return { mode: ledgerMode(), pending, confirmed, conflict, mismatches, oldestPending, recent };
}
