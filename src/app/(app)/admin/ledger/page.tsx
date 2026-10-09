import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth";
import { ledgerOverview } from "@/server/ledger/status";
import { fmtStamp } from "@/lib/format";
import { LedgerActions } from "./ledger-client";

export const metadata: Metadata = { title: "Blockchain" };

const KIND: Record<string, string> = {
  MISSING_ON_CHAIN: "Confirmed here, missing on-chain",
  PAYLOAD_MISMATCH: "On-chain record differs from ours",
  UNKNOWN_ON_CHAIN: "On-chain event we have no record of",
  CONFLICT_ON_SUBMIT: "Ledger rejected: different payload under the same id",
};

export default async function LedgerPage() {
  await requirePageUser("ADMIN");
  const o = await ledgerOverview();

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Blockchain</h1>
          <p className="mt-1.5 max-w-[66ch] text-[14px] text-muted">
            Hyperledger Fabric verification layer. Events are queued with each decision and delivered by the relay; nothing personal is ever written on-chain.
          </p>
        </div>
        <LedgerActions />
      </div>

      <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-3 border-y border-rule py-4 text-[13.5px]">
        <div>
          <dt className="label-caps">Mode</dt>
          <dd className="mono mt-0.5">{o.mode === "fabric" ? "fabric · campussign" : "off"}</dd>
        </div>
        <div>
          <dt className="label-caps">Confirmed</dt>
          <dd className="mono mt-0.5 text-[18px] font-semibold">{o.confirmed}</dd>
        </div>
        <div>
          <dt className="label-caps">Pending</dt>
          <dd className={`mono mt-0.5 text-[18px] font-semibold ${o.pending ? "text-warning" : ""}`}>{o.pending}</dd>
        </div>
        <div>
          <dt className="label-caps">Conflicts</dt>
          <dd className={`mono mt-0.5 text-[18px] font-semibold ${o.conflict ? "text-error" : ""}`}>{o.conflict}</dd>
        </div>
        <div>
          <dt className="label-caps">Oldest pending</dt>
          <dd className="mono mt-0.5">{o.oldestPending ? fmtStamp(o.oldestPending.createdAt) : "—"}</dd>
        </div>
      </dl>

      <section className="mt-8" aria-labelledby="mm-h">
        <h2 id="mm-h" className="heading border-b border-rule pb-2.5 text-[17px]">
          Open mismatches <span className="mono ml-1 text-[13px] font-medium text-muted">{o.mismatches.length}</span>
        </h2>
        {o.mismatches.length === 0 ? (
          <p className="pt-4 text-[14px] text-ink-2">None. Run a reconciliation to compare every confirmed event with the ledger.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Detected</th>
                  <th>Problem</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {o.mismatches.map((m) => (
                  <tr key={m.id}>
                    <td className="mono text-[12px] whitespace-nowrap">{fmtStamp(m.detectedAt)}</td>
                    <td className="text-[13.5px] text-error">{KIND[m.kind] ?? m.kind}</td>
                    <td className="mono text-[12px] text-muted">{m.eventId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-10" aria-labelledby="ev-h">
        <h2 id="ev-h" className="heading border-b border-rule pb-2.5 text-[17px]">
          Recent events
        </h2>
        <div className="overflow-x-auto">
          <table className="ledger min-w-[760px]">
            <thead>
              <tr>
                <th>Queued</th>
                <th>Event</th>
                <th>Status</th>
                <th>Block · transaction</th>
              </tr>
            </thead>
            <tbody>
              {o.recent.map((r) => (
                <tr key={r.id}>
                  <td className="mono text-[12px] whitespace-nowrap">{fmtStamp(r.createdAt)}</td>
                  <td className="mono text-[12.5px]">
                    {r.type}
                    <span className="block text-[11px] text-muted">{r.id}</span>
                  </td>
                  <td>
                    <span className={`status ${r.status === "CONFIRMED" ? "status-active" : r.status === "CONFLICT" ? "status-error" : "status-warn"}`}>
                      {r.status === "PENDING" && r.attempts ? `Retrying (${r.attempts})` : r.status.toLowerCase()}
                    </span>
                    {r.lastError && r.status !== "CONFIRMED" && <span className="block max-w-[260px] truncate text-[11.5px] text-muted" title={r.lastError}>{r.lastError}</span>}
                  </td>
                  <td className="mono text-[12px] text-ink-2">
                    {r.blockNumber ? `#${r.blockNumber} · ` : ""}
                    {r.txId ? `${r.txId.slice(0, 16)}…` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
