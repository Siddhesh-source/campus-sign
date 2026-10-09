import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { listStudentDocuments } from "@/server/documents";
import { DocStatus } from "@/components/doc-ui";
import { fmtDate } from "@/lib/format";

export const metadata: Metadata = { title: "Documents" };

export default async function DocumentsPage() {
  const user = await requirePageUser("STUDENT");
  const docs = await listStudentDocuments(user.id);

  return (
    <div className="mx-auto max-w-[860px] px-4 py-8 sm:px-8 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-title">Documents</h1>
        <Link href="/documents/new" className="btn btn-primary">
          New submission
        </Link>
      </div>

      {docs.length === 0 ? (
        <div className="mt-8 max-w-[520px] border-t border-rule pt-6">
          <p className="text-[15px] text-ink-2">
            Nothing submitted yet. Upload a PDF for one of your classes and track it here until it&apos;s signed.
          </p>
          <Link href="/documents/new" className="btn btn-secondary mt-4">
            Submit your first document
          </Link>
        </div>
      ) : (
        <ul className="mt-6 border-t border-rule">
          {docs.map((d) => (
            <li key={d.id} className="border-b border-rule">
              <Link
                href={`/documents/${d.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3.5 hover:bg-[color-mix(in_srgb,var(--surface)_55%,transparent)]"
              >
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-semibold">{d.title}</div>
                  <div className="truncate text-[12.5px] text-muted">
                    {d.type.name} · {d.class.name} · {d.class.yearOfStudy} {d.class.division}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="mono text-[11.5px] text-muted">
                    v{d.current?.number ?? 1} · {fmtDate(d.updatedAt)}
                  </span>
                  <DocStatus status={d.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
