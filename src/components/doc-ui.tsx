import type { DocumentEventType, DocumentStatus } from "@/generated/prisma/enums";
import { fmtStamp } from "@/lib/format";

const STATUS: Record<DocumentStatus, { label: string; cls: string }> = {
  DRAFT: { label: "Draft", cls: "status-off" },
  SUBMITTED: { label: "Submitted", cls: "status-warn" },
  PENDING_REVIEW: { label: "In review", cls: "status-warn" },
  CORRECTIONS_REQUESTED: { label: "Corrections requested", cls: "status-error" },
  REJECTED: { label: "Rejected", cls: "status-error" },
  APPROVED: { label: "Approved & signed", cls: "status-active" },
};

export function DocStatus({ status }: { status: DocumentStatus }) {
  const s = STATUS[status];
  return <span className={`status ${s.cls}`}>{s.label}</span>;
}

/** SHA-256 shown like a serial number: grouped, truncated, full value on hover. */
export function Hash({ value, full = false, className = "" }: { value: string; full?: boolean; className?: string }) {
  const shown = full ? value : `${value.slice(0, 16)}…${value.slice(-8)}`;
  const grouped = full ? shown.replace(/(.{8})/g, "$1 ").trim() : shown;
  return (
    <span className={`mono break-all text-[12px] text-ink-2 ${className}`} title={value}>
      {grouped}
    </span>
  );
}

const EVENT: Record<DocumentEventType, string> = {
  CREATED: "Document created",
  VERSION_UPLOADED: "Uploaded version",
  SUBMITTED: "Submitted for review",
  REVIEW_STARTED: "Faculty opened for review",
  CORRECTIONS_REQUESTED: "Corrections requested",
  REJECTED: "Rejected",
  APPROVED_SIGNED: "Approved and signed",
};

type Ev = { id: string; type: DocumentEventType; actorId: string; createdAt: Date; reason: string | null; versionId: string | null };

export function Timeline({ events, names, versionNumbers }: { events: Ev[]; names: Record<string, string>; versionNumbers: Record<string, number> }) {
  return (
    <ol className="relative space-y-4 border-l border-rule pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ${
              e.type === "APPROVED_SIGNED" ? "bg-green" : e.type === "REJECTED" || e.type === "CORRECTIONS_REQUESTED" ? "bg-error" : "bg-rule-strong"
            }`}
            aria-hidden="true"
          />
          <div className="text-[13.5px] font-semibold">
            {EVENT[e.type]}
            {e.versionId && versionNumbers[e.versionId] ? <span className="mono ml-1.5 font-medium text-muted">v{versionNumbers[e.versionId]}</span> : null}
          </div>
          <div className="mono text-[11.5px] text-muted">
            {fmtStamp(e.createdAt)} · {names[e.actorId] ?? "Unknown"}
          </div>
          {e.reason && <p className="mt-1.5 rounded-[4px] bg-sunken px-3 py-2 text-[13.5px] text-ink-2">{e.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

export function fmtBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
