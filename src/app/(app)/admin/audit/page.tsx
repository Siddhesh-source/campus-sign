import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { auditActions, searchAudit, type AuditFilter } from "@/server/admin";
import { AuditTable } from "@/components/audit-table";

export const metadata: Metadata = { title: "Audit log" };

const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<AuditFilter> }) {
  await requirePageUser("ADMIN");
  const f = await searchParams;
  const [rows, actions] = await Promise.all([searchAudit(f, PAGE), auditActions()]);
  const hasMore = rows.length > PAGE;
  const events = rows.slice(0, PAGE);
  const params = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && k !== "cursor") as [string, string][]);
  const filtered = [...params.keys()].length > 0;

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Audit log</h1>
          <p className="mt-1.5 text-[14px] text-muted">Append-only. Every sensitive action is written once and can&apos;t be edited.</p>
        </div>
        <a href={`/api/admin/audit?${params}`} className="btn btn-secondary" download>
          Export CSV
        </a>
      </div>

      <form className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_150px_150px_auto] lg:items-end" role="search" aria-label="Filter audit events">
        <label className="field">
          <span className="label-caps">Actor email</span>
          <input name="actor" defaultValue={f.actor} className="input !min-h-[38px] !py-1.5 !text-[14px]" placeholder="name@vit.edu" />
        </label>
        <label className="field">
          <span className="label-caps">Action</span>
          <select name="action" defaultValue={f.action ?? ""} className="input !min-h-[38px] !py-1.5 !text-[14px]">
            <option value="">Any action</option>
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="label-caps">Target</span>
          <input name="target" defaultValue={f.target} className="input mono !min-h-[38px] !py-1.5 !text-[13px]" placeholder="document, class or key id" />
        </label>
        <label className="field">
          <span className="label-caps">From</span>
          <input type="date" name="from" defaultValue={f.from} className="input !min-h-[38px] !py-1.5 !text-[14px]" />
        </label>
        <label className="field">
          <span className="label-caps">To</span>
          <input type="date" name="to" defaultValue={f.to} className="input !min-h-[38px] !py-1.5 !text-[14px]" />
        </label>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-secondary">
            Filter
          </button>
          {filtered && (
            <Link href="/admin/audit" className="btn btn-ghost">
              Clear
            </Link>
          )}
        </div>
      </form>

      {events.length === 0 ? (
        <p className="mt-8 border-t border-rule pt-5 text-[14px] text-ink-2">{filtered ? "No events match these filters." : "No events yet."}</p>
      ) : (
        <div className="mt-6">
          <AuditTable rows={events} />
        </div>
      )}

      <div className="mt-4 flex gap-2">
        {f.cursor && (
          <Link href={`/admin/audit?${params}`} className="btn btn-ghost btn-sm">
            Newest
          </Link>
        )}
        {hasMore && (
          <Link href={`/admin/audit?${new URLSearchParams([...params, ["cursor", events[events.length - 1].id]])}`} className="btn btn-secondary btn-sm">
            Older events
          </Link>
        )}
      </div>
    </div>
  );
}
