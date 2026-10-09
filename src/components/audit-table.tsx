import { fmtStamp, shortIp } from "@/lib/format";

const ALARMING = new Set(["auth.denied", "code.lookup.locked", "faculty.revoke", "class.code.revoke", "credential.revoke", "document.reject"]);

type Row = {
  id: string;
  createdAt: Date;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  metadata: unknown;
  ip: string | null;
  userAgent: string | null;
};

function summary(metadata: unknown, targetId: string | null) {
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    if (m.from !== undefined && m.to) return `${m.from ?? "—"} → ${m.to}`;
    const parts = Object.entries(m)
      .filter(([, v]) => v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${String(v)}`);
    if (parts.length) return parts.join(" · ");
  }
  return targetId ?? "";
}

/**
 * Ledger of audit events with an expandable detail row per event. Used by the
 * admin audit log and by each person's own activity page.
 */
export function AuditTable({ rows, showActor = true }: { rows: Row[]; showActor?: boolean }) {
  return (
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
      <table className="ledger min-w-[720px]">
        <thead>
          <tr>
            <th>When</th>
            {showActor && <th>Actor</th>}
            <th>Action</th>
            <th>Detail</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td className="mono align-top text-[12px] whitespace-nowrap text-ink-2">{fmtStamp(e.createdAt)}</td>
              {showActor && <td className="mono align-top text-[12.5px]">{e.actorEmail ?? "—"}</td>}
              <td className={`mono align-top text-[12.5px] ${ALARMING.has(e.action) ? "text-error" : ""}`}>{e.action}</td>
              <td className="align-top">
                <details className="group">
                  <summary className="mono max-w-[420px] cursor-pointer truncate text-[12px] text-muted marker:text-faint" title={summary(e.metadata, e.targetId)}>
                    {summary(e.metadata, e.targetId) || "details"}
                  </summary>
                  <dl className="mono mt-2 grid grid-cols-[90px_1fr] gap-x-3 gap-y-1 rounded-[4px] bg-sunken p-3 text-[11.5px]">
                    <dt className="text-muted">event</dt>
                    <dd className="break-all">{e.id}</dd>
                    <dt className="text-muted">target</dt>
                    <dd className="break-all">{[e.targetType, e.targetId].filter(Boolean).join(" · ") || "—"}</dd>
                    <dt className="text-muted">ip</dt>
                    <dd>{shortIp(e.ip)}</dd>
                    <dt className="text-muted">agent</dt>
                    <dd className="break-all">{e.userAgent ?? "—"}</dd>
                    <dt className="text-muted">data</dt>
                    <dd className="break-all whitespace-pre-wrap">{e.metadata ? JSON.stringify(e.metadata, null, 1) : "—"}</dd>
                  </dl>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
