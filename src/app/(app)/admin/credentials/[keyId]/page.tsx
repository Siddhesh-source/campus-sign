import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/server/auth";
import { documentsSignedByKey } from "@/server/admin";
import { DocStatus } from "@/components/doc-ui";
import { fmtStamp } from "@/lib/format";

export const metadata: Metadata = { title: "Documents signed by key" };

export default async function KeyDocumentsPage({ params }: { params: Promise<{ keyId: string }> }) {
  await requirePageUser("ADMIN");
  const { keyId } = await params;
  const data = await documentsSignedByKey(decodeURIComponent(keyId));
  if (!data) notFound();
  const { credential: c, signatures } = data;

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="mb-2 text-[13px] text-muted">
        <Link href="/admin/credentials" className="hover:underline">
          Signing keys
        </Link>{" "}
        / {c.keyId}
      </div>
      <h1 className="page-title">Signed with {c.keyId}</h1>
      <p className="mt-2 text-[14px] text-muted">
        {c.faculty.name} · <span className="mono">{c.faculty.email}</span> · <span className={c.status === "REVOKED" ? "text-error" : ""}>{c.status.toLowerCase()}</span>
        {c.revokedReason ? ` · ${c.revokedReason}` : ""}
      </p>
      {c.status === "REVOKED" && signatures.length > 0 && (
        <div className="notice notice-warn mt-5 max-w-[760px]">
          <span>
            These {signatures.length} signatures now fail verification. Follow the key-compromise runbook (docs/operations/runbook.md): contact the
            class faculty, have each document re-reviewed and signed with a new key.
          </span>
        </div>
      )}
      {signatures.length === 0 ? (
        <p className="mt-8 border-t border-rule pt-5 text-[14px] text-ink-2">This key hasn&apos;t signed anything.</p>
      ) : (
        <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="ledger min-w-[700px]">
            <thead>
              <tr>
                <th>Verification code</th>
                <th>Type</th>
                <th>Class</th>
                <th>Step</th>
                <th>Signed</th>
                <th>Status now</th>
              </tr>
            </thead>
            <tbody>
              {signatures.map((s) => (
                <tr key={s.code}>
                  <td>
                    <Link href={`/verify/${s.code}`} className="mono text-[12.5px] underline-offset-2 hover:underline">
                      {s.code}
                    </Link>
                  </td>
                  <td className="text-[13.5px]">{s.document.type.name}</td>
                  <td className="text-[13.5px] text-ink-2">
                    {s.document.class.name} · {s.document.class.yearOfStudy} {s.document.class.division}
                    <span className="mono block text-[11.5px] text-muted">{s.document.class.faculty.email}</span>
                  </td>
                  <td className="mono text-[12.5px]">
                    {s.stepOrder}/{s.totalSteps}
                  </td>
                  <td className="mono text-[12px] whitespace-nowrap">{fmtStamp(s.signedAt)}</td>
                  <td>
                    <DocStatus status={s.document.status} />
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
