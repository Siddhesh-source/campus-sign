import "server-only";
import type { LedgerEventInput } from "@ledger-core";
import { db } from "../db";
import { log } from "../log";
import { getLedger, LedgerConflictError, type LedgerClient } from "./client";

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;
/** How long a relay owns a claimed row. Longer than the slowest ledger call (endorse + commit). */
export const LEASE_MS = 2 * 60_000;

export function backoff(attempts: number) {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
}

export type RelayOutcome = { id: string; result: "CONFIRMED" | "REPLAYED" | "RETRY" | "CONFLICT" };

/** Test hook to simulate a crash between the ledger commit and the DB update. */
export type RelayHooks = { afterLedgerCommit?: (id: string) => void | Promise<void> };

/** Thrown by tests' afterLedgerCommit hook to model a process crash. */
export class SimulatedCrash extends Error {}

/**
 * Deliver at most one due outbox row using a lease, so no database
 * transaction or row lock is held while waiting on the ledger:
 *
 *   1. claim   UPDATE … SET lockedUntil = now+lease  (FOR UPDATE SKIP LOCKED: one relay per row)
 *   2. submit  to the ledger, no DB connection held  (idempotent on eventId)
 *   3. settle  UPDATE … WHERE lockedUntil = <our lease>  (fencing: a relay that lost its lease writes nothing)
 *
 * If the process dies after the ledger commit but before step 3, the row stays
 * PENDING; once the lease expires another relay re-submits, the chaincode
 * returns the stored event (REPLAYED) and it is marked CONFIRMED. No duplicate
 * event can exist on-chain.
 */
export async function relayOne(ledger: LedgerClient, hooks: RelayHooks = {}, now = new Date()): Promise<RelayOutcome | null> {
  const lease = new Date(now.getTime() + LEASE_MS);
  const [row] = await db.$queryRaw<{ id: string; payload: string; attempts: number }[]>`
    UPDATE "ledger_outbox" SET "lockedUntil" = ${lease}
    WHERE "id" = (
      SELECT "id" FROM "ledger_outbox"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now} AND ("lockedUntil" IS NULL OR "lockedUntil" < ${now})
      ORDER BY "createdAt" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id", "payload", "attempts"`;
  if (!row) return null;
  const ours = { id: row.id, lockedUntil: lease };

  try {
    const res = await ledger.record(JSON.parse(row.payload) as LedgerEventInput);
    await hooks.afterLedgerCommit?.(row.id);
    await db.ledgerOutbox.updateMany({
      where: ours,
      data: {
        status: "CONFIRMED",
        attempts: row.attempts + 1,
        txId: res.txId,
        ...(res.blockNumber !== null ? { blockNumber: res.blockNumber } : {}),
        onChainAt: new Date(res.event.txTimestamp),
        confirmedAt: new Date(),
        lastError: null,
        lockedUntil: null,
      },
    });
    return { id: row.id, result: res.status === "CREATED" ? "CONFIRMED" : "REPLAYED" };
  } catch (err) {
    if (err instanceof SimulatedCrash) throw err; // a "crash": nothing after this point runs
    if (err instanceof LedgerConflictError) {
      await db.$transaction([
        db.ledgerOutbox.updateMany({ where: ours, data: { status: "CONFLICT", attempts: row.attempts + 1, lastError: err.message.slice(0, 500), lockedUntil: null } }),
        db.ledgerMismatch.create({ data: { eventId: row.id, kind: "CONFLICT_ON_SUBMIT", detail: { error: err.message.slice(0, 500) } } }),
      ]);
      log.error({ eventId: row.id, err: err.message }, "ledger conflict");
      return { id: row.id, result: "CONFLICT" };
    }
    const attempts = row.attempts + 1;
    await db.ledgerOutbox.updateMany({
      where: ours,
      data: { attempts, nextAttemptAt: new Date(now.getTime() + backoff(attempts)), lastError: (err as Error).message.slice(0, 500), lockedUntil: null },
    });
    log.warn({ eventId: row.id, attempts, err: (err as Error).message }, "ledger submit failed; will retry");
    return { id: row.id, result: "RETRY" };
  }
}

/** Drain everything that's due (bounded). Returns what happened to each row. */
export async function relayDue(opts: { limit?: number; ledger?: LedgerClient | null; now?: Date } = {}): Promise<RelayOutcome[]> {
  const ledger =
    opts.ledger !== undefined
      ? opts.ledger
      : await getLedger().catch((err) => {
          log.warn({ err: (err as Error).message }, "ledger unavailable");
          return null;
        });
  if (!ledger) return [];
  const out: RelayOutcome[] = [];
  for (let i = 0; i < (opts.limit ?? 50); i++) {
    const r = await relayOne(ledger, {}, opts.now ?? new Date());
    if (!r) break;
    out.push(r);
    if (r.result === "RETRY") break; // ledger is struggling; let backoff work
  }
  return out;
}

let running: Promise<unknown> | null = null;

/** Best-effort, non-blocking delivery right after a business change. The worker covers failures. */
export function kickRelay() {
  if (running) return running;
  running = relayDue({ limit: 20 })
    .catch((err) => log.warn({ err: (err as Error).message }, "relay kick failed"))
    .finally(() => {
      running = null;
    });
  return running;
}
