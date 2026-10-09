import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { searchAudit } from "@/server/admin";
import { AuditTable } from "@/components/audit-table";

export const metadata: Metadata = { title: "Activity" };

const PAGE = 50;

/** Each person's own audit trail: what they did, when, from where. */
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ action?: string; cursor?: string }> }) {
  const user = await requirePageUser("FACULTY", "STUDENT");
  const f = await searchParams;
  const rows = await searchAudit({ actorId: user.id, action: f.action, cursor: f.cursor }, PAGE);
  const hasMore = rows.length > PAGE;
  const events = rows.slice(0, PAGE);
  const groups =
    user.role === "FACULTY"
      ? [["", "Everything"], ["class.", "Classes and codes"], ["document.", "Reviews and signatures"], ["credential.", "Signing key"], ["auth.", "Sign-ins"]]
      : [["", "Everything"], ["enrollment.", "Classes"], ["document.", "Documents"], ["auth.", "Sign-ins"]];

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="page-title">Your activity</h1>
      <p className="mt-1.5 max-w-[62ch] text-[14px] text-muted">
        Everything recorded against your account, newest first. This is the same append-only log administrators see.
      </p>
      <nav className="mt-5 flex flex-wrap gap-1.5" aria-label="Filter activity">
        {groups.map(([v, l]) => (
          <Link
            key={v}
            href={v ? `/activity?action=${v}` : "/activity"}
            className={`rounded-[4px] px-3 py-1.5 text-[13.5px] ${(f.action ?? "") === v ? "bg-sunken font-semibold text-ink" : "text-ink-2 hover:bg-sunken"}`}
            aria-current={(f.action ?? "") === v ? "page" : undefined}
          >
            {l}
          </Link>
        ))}
      </nav>
      {events.length === 0 ? (
        <p className="mt-6 border-t border-rule pt-5 text-[14px] text-ink-2">Nothing here yet.</p>
      ) : (
        <div className="mt-4">
          <AuditTable rows={events} showActor={false} />
        </div>
      )}
      {hasMore && (
        <Link href={`/activity?${new URLSearchParams({ ...(f.action ? { action: f.action } : {}), cursor: events[events.length - 1].id })}`} className="btn btn-secondary btn-sm mt-4">
          Older activity
        </Link>
      )}
    </div>
  );
}
