import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { getFacultyClasses } from "@/server/classes";
import { listDocumentTypes, listInbox } from "@/server/documents";
import { DocStatus } from "@/components/doc-ui";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Inbox" };

const STATUSES = [
  ["", "Needs review"],
  ["SUBMITTED", "Submitted"],
  ["PENDING_REVIEW", "In review"],
  ["CORRECTIONS_REQUESTED", "Corrections requested"],
  ["APPROVED", "Approved"],
  ["REJECTED", "Rejected"],
  ["ALL", "All"],
] as const;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ status?: string; classId?: string; typeId?: string; sort?: string }> }) {
  const user = await requirePageUser("FACULTY");
  const f = await searchParams;
  const status = f.status ?? "";
  const [classes, types] = await Promise.all([getFacultyClasses(user.id), listDocumentTypes()]);
  let docs = await listInbox(user.id, { ...f, status: status === "ALL" || status === "" ? undefined : status });
  if (status === "") docs = docs.filter((d) => d.status === "SUBMITTED" || d.status === "PENDING_REVIEW");

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Inbox</h1>
          <p className="mt-1.5 text-[14px] text-muted">
            <b className="mono text-ink">{docs.length}</b> {status === "" ? "waiting for your review" : "matching"}
          </p>
        </div>
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter inbox">
        <label className="field min-w-[170px]">
          <span className="label-caps">Status</span>
          <select name="status" defaultValue={status} className="input !min-h-[38px] !py-1.5 !text-[14px]">
            {STATUSES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="field min-w-[200px]">
          <span className="label-caps">Class</span>
          <select name="classId" defaultValue={f.classId ?? ""} className="input !min-h-[38px] !py-1.5 !text-[14px]">
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} · {c.yearOfStudy} {c.division}
              </option>
            ))}
          </select>
        </label>
        <label className="field min-w-[170px]">
          <span className="label-caps">Type</span>
          <select name="typeId" defaultValue={f.typeId ?? ""} className="input !min-h-[38px] !py-1.5 !text-[14px]">
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field min-w-[150px]">
          <span className="label-caps">Sort</span>
          <select name="sort" defaultValue={f.sort ?? "newest"} className="input !min-h-[38px] !py-1.5 !text-[14px]">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="class">By class</option>
            <option value="status">By status</option>
          </select>
        </label>
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
      </form>

      {docs.length === 0 ? (
        <p className="mt-8 border-t border-rule pt-5 text-[14px] text-ink-2">
          {status === "" ? "Nothing waiting. Submissions from your classes land here the moment a student submits." : "No documents match these filters."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="ledger min-w-[760px]">
            <thead>
              <tr>
                <th>Document</th>
                <th>Student</th>
                <th>Class</th>
                <th>Submitted</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.id}>
                  <td>
                    <Link href={`/review/${d.id}`} className="font-semibold underline-offset-2 hover:underline">
                      {d.title}
                    </Link>
                    <span className="mono block text-[12px] text-muted">
                      {d.type.name} · v{d.current?.number}
                    </span>
                  </td>
                  <td>
                    {d.student.name}
                    <span className="mono block text-[12px] text-muted">{d.student.email}</span>
                  </td>
                  <td className="text-[13.5px] text-ink-2">
                    {d.class.name} · {d.class.yearOfStudy} {d.class.division}
                  </td>
                  <td className="mono text-[12.5px] whitespace-nowrap text-ink-2">{d.submittedAt ? fmtDateTime(d.submittedAt) : "—"}</td>
                  <td>
                    <DocStatus status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
