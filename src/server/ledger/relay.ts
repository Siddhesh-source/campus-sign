import "server-only";
import type { LedgerEventInput } from "@ledger-core";
import { db } from "../db";
import { log } from "../log";
import { getLedger, LedgerConflictError, type LedgerClient } from "./client";

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;

export function backoff(attempts: number) {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1), MAX_DELAY_MS);
}

export type RelayOutcome = { id: string; result: "CONFIRMED" | "REPLAYED" | "RETRY" | "CONFLICT" };

/** Test hook to simulate a crash between the ledger commit and the DB update. */
export type RelayHooks = { afterLedgerCommit?: (id: string) => void | Promise<void> };

/**
 * Deliver at most one due outbox row, inside its own DB transaction:
 *
 *   BEGIN; SELECT … FOR UPDATE SKIP LOCKED   (no two relays take the same row)
 *   submit to ledger (idempotent on eventId)
 *   UPDATE → CONFIRMED                        COMMIT
 *
 * If the process dies after the ledger commit but before COMMIT, the row stays
 * PENDING; the next run re-submits, the chaincode returns the stored event
 * (REPLAYED) and we mark it CONFIRMED. No duplicate event can exist on-chain.
 */
export async function relayOne(ledger: LedgerClient, hooks: RelayHooks = {}, now = new Date()): Promise<RelayOutcome | null> {
  return db.$transaction(
    async (tx) => {
      const [row] = await tx.$queryRaw<{ id: string; payload: string; attempts: number }[]>`
        SELECT "id", "payload", "attempts" FROM "ledger_outbox"
        WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
        ORDER BY "createdAt" ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED`;
      if (!row) return null;

      try {
        const res = await ledger.record(JSON.parse(row.payload) as LedgerEventInput);
        await hooks.afterLedgerCommit?.(row.id);
        await tx.ledgerOutbox.update({
          where: { id: row.id },
          data: {
            status: "CONFIRMED",
            attempts: row.attempts + 1,
            txId: res.txId,
            ...(res.blockNumber !== null ? { blockNumber: res.blockNumber } : {}),
            onChainAt: new Date(res.event.txTimestamp),
            confirmedAt: new Date(),
            lastError: null,
          },
        });
        return { id: row.id, result: res.status === "CREATED" ? "CONFIRMED" : "REPLAYED" } as const;
      } catch (err) {
        if (err instanceof LedgerConflictError) {
          await tx.ledgerOutbox.update({ where: { id: row.id }, data: { status: "CONFLICT", attempts: row.attempts + 1, lastError: err.message.slice(0, 500) } });
          await tx.ledgerMismatch.create({ data: { eventId: row.id, kind: "CONFLICT_ON_SUBMIT", detail: { error: err.message.slice(0, 500) } } });
          log.error({ eventId: row.id, err: err.message }, "ledger conflict");
          return { id: row.id, result: "CONFLICT" } as const;
        }
        if (hooks.afterLedgerCommit && err instanceof SimulatedCrash) throw err;
        const attempts = row.attempts + 1;
        await tx.ledgerOutbox.update({
          where: { id: row.id },
          data: { attempts, nextAttemptAt: new Date(now.getTime() + backoff(attempts)), lastError: (err as Error).message.slice(0, 500) },
        });
        log.warn({ eventId: row.id, attempts, err: (err as Error).message }, "ledger submit failed; will retry");
        return { id: row.id, result: "RETRY" } as const;
      }
    },
    { timeout: 90_000, maxWait: 10_000 },
  );
}

/** Thrown by tests' afterLedgerCommit hook to model a process crash. */
export class SimulatedCrash extends Error {}

/** Drain everything that's due (bounded). Returns what happened to each row. */
export async function relayDue(opts: { limit?: number; ledger?: LedgerClient | null } = {}): Promise<RelayOutcome[]> {
  const ledger = opts.ledger !== undefined ? opts.ledger : await getLedger().catch((err) => {
    log.warn({ err: (err as Error).message }, "ledger unavailable");
    return null;
  });
  if (!ledger) return [];
  const out: RelayOutcome[] = [];
  for (let i = 0; i < (opts.limit ?? 50); i++) {
    const r = await relayOne(ledger);
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
