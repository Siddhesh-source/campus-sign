import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth";
import { listFacultyAccess } from "@/server/faculty";
import { fmtDateTime } from "@/lib/format";
import { AddFacultyForm, DecisionButtons } from "./admin-client";

export const metadata: Metadata = { title: "Faculty access" };

const statusClass = { PENDING: "status-warn", APPROVED: "status-active", REJECTED: "status-error", REVOKED: "status-off" } as const;
const statusLabel = { PENDING: "Pending", APPROVED: "Verified", REJECTED: "Rejected", REVOKED: "Revoked" } as const;

export default async function AdminPage() {
  await requirePageUser("ADMIN");
  const rows = await listFacultyAccess();
  const pending = rows.filter((r) => r.status === "PENDING");
  const others = rows.filter((r) => r.status !== "PENDING");

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="page-title">Faculty access</h1>
      <p className="mt-2 max-w-[62ch] text-[14px] text-muted">
        Only verified faculty can create classes. Approve requests below, or add a faculty email ahead of their first
        sign-in.
      </p>

      <div className="mt-8 grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="pending-h">
            <h2 id="pending-h" className="heading border-b border-rule pb-2.5 text-[17px]">
              Waiting for review <span className="mono ml-1 text-[13px] font-medium text-muted">{pending.length}</span>
            </h2>
            {pending.length === 0 ? (
              <p className="pt-4 text-[14px] text-ink-2">No requests waiting. New faculty requests show up here.</p>
            ) : (
              <AccessTable rows={pending} />
            )}
          </section>

          <section aria-labelledby="all-h">
            <h2 id="all-h" className="heading border-b border-rule pb-2.5 text-[17px]">
              All faculty records <span className="mono ml-1 text-[13px] font-medium text-muted">{others.length}</span>
            </h2>
            {others.length === 0 ? (
              <p className="pt-4 text-[14px] text-ink-2">No faculty verified yet.</p>
            ) : (
              <AccessTable rows={others} />
            )}
          </section>
        </div>

        <aside className="panel p-5">
          <h2 className="heading mb-1 text-[16px]">Add a faculty email</h2>
          <p className="mb-4 text-[13px] text-muted">They get faculty tools as soon as they sign in with this address.</p>
          <AddFacultyForm />
        </aside>
      </div>
    </div>
  );
}

function AccessTable({ rows }: { rows: Awaited<ReturnType<typeof listFacultyAccess>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="ledger">
        <thead>
          <tr>
            <th>Person</th>
            <th className="hidden md:table-cell">Department</th>
            <th>Status</th>
            <th className="hidden md:table-cell">Updated</th>
            <th className="text-right">
              <span className="sr-only">Decision</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>
                <b className="font-semibold">{r.user?.name ?? "Not signed in yet"}</b>
                <span className="mono block text-[12px] text-muted">{r.email}</span>
              </td>
              <td className="hidden text-[13.5px] text-ink-2 md:table-cell">{r.department ?? "—"}</td>
              <td>
                <span className={`status ${statusClass[r.status]}`}>{statusLabel[r.status]}</span>
              </td>
              <td className="mono hidden text-[12.5px] whitespace-nowrap text-ink-2 md:table-cell">{fmtDateTime(r.updatedAt)}</td>
              <td className="text-right">
                <DecisionButtons id={r.id} status={r.status} email={r.email} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
