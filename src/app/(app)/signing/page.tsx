import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth";
import { listCredentials } from "@/server/signing";
import { fmtStamp } from "@/lib/format";
import { CredentialActions, RevokeButton } from "./signing-client";

export const metadata: Metadata = { title: "Signing key" };

const statusClass = { ACTIVE: "status-active", ROTATED: "status-off", REVOKED: "status-error" } as const;
const statusLabel = { ACTIVE: "Active", ROTATED: "Rotated · still verifies", REVOKED: "Revoked · fails verification" } as const;

export default async function SigningPage() {
  const user = await requirePageUser("FACULTY");
  const creds = await listCredentials(user.id);
  const active = creds.find((c) => c.status === "ACTIVE");

  return (
    <div className="mx-auto max-w-[860px] px-4 py-8 sm:px-8 sm:py-10">
      <h1 className="page-title">Signing key</h1>
      <p className="mt-2 max-w-[62ch] text-[14px] text-ink-2">
        Your approvals are signed with an Ed25519 key held on the server and encrypted at rest. You never see or download the
        private key. Rotate it any time; revoke it if you think it&apos;s been misused, and every signature it made stops verifying.
      </p>

      <div className="panel mt-6 p-5">
        {active ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="micro">Active key</div>
              <div className="mono mt-1 text-[16px] font-semibold">{active.keyId}</div>
              <div className="mono text-[11.5px] text-muted">
                created {fmtStamp(active.createdAt)} · {active._count.signatures} signature{active._count.signatures === 1 ? "" : "s"}
              </div>
            </div>
            <CredentialActions hasActive />
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-[14px] text-ink-2">You don&apos;t have an active signing key, so you can&apos;t approve documents yet.</p>
            <CredentialActions hasActive={false} />
          </div>
        )}
      </div>

      {creds.length > 0 && (
        <div className="mt-8 overflow-x-auto">
          <table className="ledger">
            <thead>
              <tr>
                <th>Key</th>
                <th>Status</th>
                <th>Created</th>
                <th>Signatures</th>
                <th className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {creds.map((c) => (
                <tr key={c.id}>
                  <td className="mono text-[12.5px]">{c.keyId}</td>
                  <td>
                    <span className={`status ${statusClass[c.status]}`}>{statusLabel[c.status]}</span>
                    {c.revokedReason && <span className="block text-[12px] text-muted">{c.revokedReason}</span>}
                  </td>
                  <td className="mono text-[12px] whitespace-nowrap text-ink-2">{fmtStamp(c.createdAt)}</td>
                  <td className="mono text-[12.5px]">{c._count.signatures}</td>
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
