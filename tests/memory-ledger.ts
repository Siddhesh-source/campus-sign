import { randomBytes } from "node:crypto";
import { canonical, decideRecord, validateEvent, type LedgerEventInput, type StoredLedgerEvent } from "@ledger-core";
import { LedgerConflictError, LedgerUnavailableError, type LedgerClient, type RecordResult } from "@/server/ledger/client";

/**
 * In-memory ledger with the chaincode's exact rules (same core module), plus
 * failure injection for crash/retry tests. The real-Fabric test runs the same
 * scenarios against the network when LEDGER_IT=1.
 */
export class MemoryLedger implements LedgerClient {
  readonly name = "memory";
  events = new Map<string, StoredLedgerEvent>();
  block = BigInt(0);
  writes = 0;
  /** Next N record() calls fail before touching state (ledger down). */
  failBefore = 0;
  /** Next N record() calls commit, then throw (lost response / timeout after commit). */
  failAfterCommit = 0;
  down = false;

  async record(input: LedgerEventInput): Promise<RecordResult> {
    if (this.down || this.failBefore > 0) {
      this.failBefore = Math.max(0, this.failBefore - 1);
      throw new LedgerUnavailableError("ledger unreachable");
    }
    const event = validateEvent(JSON.parse(canonical(input)));
    const decision = decideRecord(this.events.get(event.eventId) ?? null, event);
    if (decision.action === "CONFLICT") throw new LedgerConflictError(`CONFLICT: ${event.eventId}`);
    this.block += BigInt(1);
    let res: RecordResult;
    if (decision.action === "REPLAY") {
      res = { status: "REPLAYED", event: decision.stored, txId: decision.stored.txId, blockNumber: null };
    } else {
      const stored: StoredLedgerEvent = { ...event, txId: randomBytes(32).toString("hex"), txTimestamp: new Date().toISOString(), submitterMsp: "Org1MSP" };
      this.events.set(event.eventId, stored);
      this.writes += 1;
      res = { status: "CREATED", event: stored, txId: stored.txId, blockNumber: this.block };
    }
    if (this.failAfterCommit > 0) {
      this.failAfterCommit -= 1;
      throw new LedgerUnavailableError("commit status timed out");
    }
    return res;
  }

  private guard() {
    if (this.down) throw new LedgerUnavailableError("ledger unreachable");
  }
  async getEvent(id: string) {
    this.guard();
    return this.events.get(id) ?? null;
  }
  async getByHash(sha: string) {
    this.guard();
    return [...this.events.values()].filter((e) => e.sha256 === sha || e.signedSha256 === sha);
  }
  async getByKey(keyId: string) {
    this.guard();
    return [...this.events.values()].filter((e) => e.signerKeyId === keyId);
  }
  async listAll() {
    this.guard();
    return [...this.events.values()];
  }
}
