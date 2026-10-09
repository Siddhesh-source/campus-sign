import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { listAuditEvents } from "@/server/faculty";
import { fmtStamp } from "@/lib/format";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;
const alarming = new Set(["auth.denied", "code.lookup.locked", "faculty.revoke", "class.code.revoke"]);

function detail(metadata: unknown, targetId: string | null) {
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

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; cursor?: string }> }) {
  await requirePageUser("ADMIN");
  const { q, cursor } = await searchParams;
  const rows = await listAuditEvents({ q: q?.slice(0, 80), cursor }, PAGE);
  const hasMore = rows.length > PAGE;
  const events = rows.slice(0, PAGE);

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="mt-1.5 text-[14px] text-muted">Append-only. Every sensitive action is written once and can&apos;t be edited.</p>
        </div>
        <form className="flex gap-2" role="search">
          <label htmlFor="q" className="sr-only">
            Filter
          </label>
          <input id="q" name="q" defaultValue={q} className="input !w-[240px] !text-[14px]" placeholder="Filter by email or action" />
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
        </form>
      </div>

      {events.length === 0 ? (
        <p className="mt-8 border-t border-rule pt-5 text-[14px] text-ink-2">
          {q ? `No events match “${q}”.` : "No events yet. Sign-ins, approvals and code changes appear here."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="ledger min-w-[760px]">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="mono text-[12px] whitespace-nowrap text-ink-2">{fmtStamp(e.createdAt)}</td>
                  <td className="mono text-[12.5px]">{e.actorEmail ?? "—"}</td>
                  <td className={`mono text-[12.5px] ${alarming.has(e.action) ? "text-error" : ""}`}>{e.action}</td>
                  <td className="mono max-w-[360px] truncate text-[12px] text-muted" title={detail(e.metadata, e.targetId)}>
                    {detail(e.metadata, e.targetId)}
                  </td>
                  <td className="mono text-[12px] text-muted">{e.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {cursor && (
          <Link href={`/admin/audit${q ? `?q=${encodeURIComponent(q)}` : ""}`} className="btn btn-ghost btn-sm">
            Newest
          </Link>
        )}
        {hasMore && (
          <Link
            href={`/admin/audit?${new URLSearchParams({ ...(q ? { q } : {}), cursor: events[events.length - 1].id })}`}
            className="btn btn-secondary btn-sm"
          >
            Older events
          </Link>
        )}
      </div>
    </div>
  );
}
