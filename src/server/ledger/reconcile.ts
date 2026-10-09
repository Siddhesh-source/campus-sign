import "server-only";
import { canonical, inputOf } from "@ledger-core";
import { db } from "../db";
import { log } from "../log";
import { getLedger, type LedgerClient } from "./client";

export type MismatchKind = "MISSING_ON_CHAIN" | "PAYLOAD_MISMATCH" | "UNKNOWN_ON_CHAIN" | "CONFLICT_ON_SUBMIT";
export type ReconcileReport = { checked: number; onChain: number; mismatches: { eventId: string; kind: MismatchKind }[] };

/**
 * Compare Postgres with the ledger in both directions. Mismatches are recorded
 * for a human; nothing is auto-repaired (either side could be the wrong one).
 */
export async function reconcile(ledgerArg?: LedgerClient | null): Promise<ReconcileReport | null> {
  const ledger = ledgerArg !== undefined ? ledgerArg : await getLedger();
  if (!ledger) return null;

  const confirmed = await db.ledgerOutbox.findMany({ where: { status: "CONFIRMED" }, select: { id: true, payload: true } });
  const all = await ledger.listAll();
  const chain = new Map(all.map((e) => [e.eventId, e]));
  const known = new Set((await db.ledgerOutbox.findMany({ select: { id: true } })).map((r) => r.id));
  const found: ReconcileReport["mismatches"] = [];

  for (const row of confirmed) {
    const onChain = chain.get(row.id);
    if (!onChain) found.push({ eventId: row.id, kind: "MISSING_ON_CHAIN" });
    else if (canonical(inputOf(onChain)) !== row.payload) found.push({ eventId: row.id, kind: "PAYLOAD_MISMATCH" });
  }
  for (const e of all) if (!known.has(e.eventId)) found.push({ eventId: e.eventId, kind: "UNKNOWN_ON_CHAIN" });

  for (const m of found) {
    const open = await db.ledgerMismatch.findFirst({ where: { eventId: m.eventId, kind: m.kind, resolvedAt: null } });
    if (!open) await db.ledgerMismatch.create({ data: { eventId: m.eventId, kind: m.kind } });
  }
  if (found.length) log.error({ count: found.length }, "ledger reconciliation found mismatches");
  return { checked: confirmed.length, onChain: all.length, mismatches: found };
}
