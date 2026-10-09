import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/server/auth";
import { listAllCredentials } from "@/server/admin";
import { fmtStamp } from "@/lib/format";
import { RevokeButton } from "../../signing/signing-client";

export const metadata: Metadata = { title: "Signing keys" };

const statusClass = { ACTIVE: "status-active", ROTATED: "status-off", REVOKED: "status-error" } as const;

export default async function CredentialsPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requirePageUser("ADMIN");
  const f = await searchParams;
  const creds = await listAllCredentials(f);

  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="page-title">Signing keys</h1>
      <p className="mt-2 max-w-[66ch] text-[14px] text-muted">
        Every faculty signing key. Revoking a key makes every document it signed fail verification, on CampusSign and on the blockchain. Use the
        affected-documents view to plan re-signing.
      </p>

      <form className="mt-6 flex flex-wrap items-end gap-3" role="search" aria-label="Filter keys">
        <label className="field min-w-[220px]">
          <span className="label-caps">Search</span>
          <input name="q" defaultValue={f.q} className="input !min-h-[38px] !py-1.5 !text-[14px]" placeholder="Name, email or key id" />
        </label>
        <label className="field">
          <span className="label-caps">Status</span>
          <select name="status" defaultValue={f.status ?? ""} className="input !min-h-[38px] !py-1.5 !text-[14px]">
            <option value="">All</option>
            <option value="ACTIVE">Active</option>
            <option value="ROTATED">Rotated</option>
            <option value="REVOKED">Revoked</option>
          </select>
        </label>
        <button className="btn btn-secondary" type="submit">
          Apply
        </button>
      </form>

      {creds.length === 0 ? (
        <p className="mt-8 border-t border-rule pt-5 text-[14px] text-ink-2">No keys match.</p>
      ) : (
        <div className="mt-6 overflow-x-auto" tabIndex={0} role="region" aria-label="Scrollable table">
          <table className="ledger min-w-[760px]">
            <thead>
              <tr>
                <th>Faculty</th>
                <th>Key</th>
                <th>Status</th>
                <th>Created</th>
                <th>Signed</th>
                <th className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {creds.map((c) => (
                <tr key={c.id}>
                  <td>
                    <b className="font-semibold">{c.faculty.name}</b>
                    <span className="mono block text-[12px] text-muted">{c.faculty.email}</span>
                  </td>
                  <td className="mono text-[12.5px]">{c.keyId}</td>
                  <td>
                    <span className={`status ${statusClass[c.status]}`}>{c.status.toLowerCase()}</span>
                    {c.revokedReason && <span className="block max-w-[220px] truncate text-[12px] text-muted">{c.revokedReason}</span>}
                  </td>
                  <td className="mono text-[12px] whitespace-nowrap text-ink-2">{fmtStamp(c.createdAt)}</td>
                  <td>
                    <Link href={`/admin/credentials/${encodeURIComponent(c.keyId)}`} className="mono text-[12.5px] underline-offset-2 hover:underline">
                      {c._count.signatures} document{c._count.signatures === 1 ? "" : "s"}
                    </Link>
                  </td>
                  <td className="text-right">{c.status !== "REVOKED" && <RevokeButton id={c.id} keyId={c.keyId} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
