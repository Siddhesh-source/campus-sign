import type { DocumentLedgerRow, LedgerCheck } from "@/server/ledger/status";
import { fmtStamp } from "@/lib/format";

const ROW_LABEL: Record<string, string> = {
  SUBMITTED: "Submission",
  APPROVED: "Approval & signature",
  REJECTED: "Rejection",
  CORRECTIONS_REQUESTED: "Corrections request",
  KEY_REVOKED: "Key revocation",
};

function short(tx: string | null | undefined) {
  return tx ? `${tx.slice(0, 10)}…${tx.slice(-6)}` : "";
}

/**
 * Blockchain state for a document, deliberately separate from the faculty's
 * decision: a decision is final in CampusSign immediately; the ledger record
 * confirms it independently, a moment (or, during an outage, longer) later.
 */
export function DocumentLedgerPanel({ rows }: { rows: DocumentLedgerRow[] }) {
  return (
    <div className="panel p-4">
      <h2 className="label-caps mb-1">Blockchain record</h2>
      <p className="mb-3 text-[12.5px] text-muted">Hashes and event IDs only. No names, comments or files go on-chain.</p>
      {rows.length === 0 ? (
        <p className="text-[13.5px] text-ink-2">Nothing recorded yet. Events are written when the document is submitted and decided.</p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{ROW_LABEL[r.type] ?? r.type}</div>
                <div className="mono truncate text-[11px] text-muted">
                  {r.status === "CONFIRMED"
                    ? `${r.blockNumber ? `block ${r.blockNumber} · ` : ""}tx ${short(r.txId)}`
                    : r.status === "CONFLICT"
                      ? "conflicts with the ledger · flagged for admin"
                      : r.attempts > 0
                        ? `retrying · attempt ${r.attempts}`
                        : `queued ${fmtStamp(r.createdAt)}`}
                </div>
              </div>
              <LedgerStatus status={r.status === "CONFIRMED" ? "CONFIRMED" : r.status === "CONFLICT" ? "MISMATCH" : "PENDING"} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LedgerStatus({ status }: { status: LedgerCheck["state"] }) {
  const map = {
    CONFIRMED: ["status-active", "Confirmed on-chain"],
    PENDING: ["status-warn", "Awaiting confirmation"],
    MISMATCH: ["status-error", "Ledger mismatch"],
    UNAVAILABLE: ["status-off", "Ledger unreachable"],
    OFF: ["status-off", "Ledger disabled"],
  } as const;
  const [cls, label] = map[status];
  return <span className={`status flex-none whitespace-nowrap ${cls}`}>{label}</span>;
}
