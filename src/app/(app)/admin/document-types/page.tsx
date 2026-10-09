import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth";
import { listDocumentTypesWithRoutes } from "@/server/routes";
import { db } from "@/server/db";
import { NewTypeForm, TypeRow } from "./types-client";

export const metadata: Metadata = { title: "Document types" };

export default async function DocumentTypesPage() {
  await requirePageUser("ADMIN");
  const [types, faculty] = await Promise.all([
    listDocumentTypesWithRoutes(),
    db.facultyAccess.findMany({ where: { status: "APPROVED" }, orderBy: { email: "asc" }, select: { email: true } }),
  ]);

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="page-title">Document types</h1>
      <p className="mt-2 max-w-[66ch] text-[14px] text-muted">
        What students can submit, and who signs it. A route runs top to bottom; each step signs on top of the previous one. Changes apply to new submissions only.
      </p>

      <div className="mt-8 grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ul className="min-w-0 divide-y divide-rule border-y border-rule">
          {types.map((t) => (
            <TypeRow
              key={t.id}
              type={{ id: t.id, code: t.code, name: t.name, active: t.active, documents: t._count.documents }}
              route={t.route.map((s) => ({ label: s.label, kind: s.kind, approverEmail: s.approverEmail ?? "" }))}
              facultyEmails={faculty.map((f) => f.email)}
            />
          ))}
        </ul>
        <aside className="panel p-5">
          <h2 className="heading mb-1 text-[16px]">Add a document type</h2>
          <p className="mb-4 text-[13px] text-muted">It starts with one step, the class faculty. Edit the route after creating it.</p>
          <NewTypeForm />
        </aside>
      </div>
    </div>
  );
}
