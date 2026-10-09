import "server-only";
import type { LedgerEventInput, StoredLedgerEvent } from "@ledger-core";

export type RecordResult = {
  status: "CREATED" | "REPLAYED";
  event: StoredLedgerEvent;
  /** Transaction that originally wrote the event (from the stored event). */
  txId: string;
  /** Block of the transaction we just submitted, when known. */
  blockNumber: bigint | null;
};

export class LedgerConflictError extends Error {}
export class LedgerUnavailableError extends Error {}

/** Everything the app needs from the blockchain. Implemented by Fabric (and an in-memory double in tests). */
export interface LedgerClient {
  readonly name: string;
  record(event: LedgerEventInput): Promise<RecordResult>;
  getEvent(eventId: string): Promise<StoredLedgerEvent | null>;
  getByHash(sha256: string): Promise<StoredLedgerEvent[]>;
  getByKey(signerKeyId: string): Promise<StoredLedgerEvent[]>;
  listAll(): Promise<StoredLedgerEvent[]>;
}

let override: LedgerClient | null | undefined;
let fabric: Promise<LedgerClient> | null = null;

export function ledgerMode(): "fabric" | "off" {
  return process.env.LEDGER_MODE === "fabric" ? "fabric" : "off";
}

/** The configured ledger, or null when the ledger layer is switched off. */
export async function getLedger(): Promise<LedgerClient | null> {
  if (override !== undefined) return override;
  if (ledgerMode() === "off") return null;
  fabric ??= import("./fabric").then((m) => m.createFabricLedger()).catch((err) => {
    fabric = null;
    throw err;
  });
  return fabric;
}

/** Tests only: swap in a ledger (or null for "off"); undefined restores config. */
export function setLedgerForTests(client: LedgerClient | null | undefined) {
  override = client;
}
