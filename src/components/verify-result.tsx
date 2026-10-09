import type { VerifyResult } from "@/server/signing";
import { GuillocheBand, Seal } from "./guilloche";
import { Hash } from "./doc-ui";
import { LedgerStatus } from "./ledger-ui";
import { fmtStamp } from "@/lib/format";

type Head = { title: string; body: string; tone: "ok" | "wait" | "bad" };

/**
 * "Fully verified" (seal) needs BOTH a valid Ed25519 signature AND a confirmed,
 * matching on-chain record. A valid signature still waiting on the ledger is
 * shown as exactly that, never as fully verified.
 */
function headline(r: VerifyResult, checkedFile: boolean): Head {
  if (r.status === "MODIFIED_OR_UNKNOWN") {
    return { title: "Not verified", body: "This file doesn't match any document signed through CampusSign. It was changed after signing, or it was never signed here.", tone: "bad" };
  }
  if (r.status === "REVOKED") {
    return { title: "Signature revoked", body: "The signer's key has been revoked, so this signature can no longer be trusted.", tone: "bad" };
  }
  if (r.status === "INVALID_SIGNATURE") {
    return { title: "Signature invalid", body: "The signing record doesn't match its cryptographic signature. Treat this document as untrusted.", tone: "bad" };
  }
  const subject = checkedFile ? "This file is exactly what was approved and signed" : "This code belongs to a document approved and signed through CampusSign";
  if (r.complete === false && r.record) {
    return {
      title: `Approved at step ${r.record.stepOrder} of ${r.record.totalSteps}`,
      body: `Every signature so far checks out, but this is an intermediate copy: the approval route isn't finished${r.nextStepLabel ? ` (waiting for ${r.nextStepLabel})` : ""}. It isn't fully verified until the last step signs.`,
      tone: "wait",
    };
  }
  switch (r.ledger?.state) {
    case "CONFIRMED":
      return { title: "Fully verified", body: `${subject}. The signature checks out and the approval is confirmed on the blockchain.`, tone: "ok" };
    case "MISMATCH":
      return { title: "Ledger mismatch", body: "The signature checks out, but the blockchain record doesn't match. Treat this document as untrusted until an administrator resolves it.", tone: "bad" };
    case "UNAVAILABLE":
      return { title: "Signature valid · blockchain unreachable", body: `${subject}, but the blockchain couldn't be checked right now. Try again shortly.`, tone: "wait" };
    case "OFF":
      return { title: "Signature valid · no blockchain record", body: `${subject}. Blockchain confirmation isn't enabled on this server.`, tone: "wait" };
    default:
      return { title: "Signature valid · awaiting blockchain confirmation", body: `${subject}. The approval is queued for the blockchain; it isn't fully verified until it's confirmed.`, tone: "wait" };
  }
}

export function VerifyResultCard({ result, checkedFile }: { result: VerifyResult; checkedFile: boolean }) {
  const h = headline(result, checkedFile);
  const r = result.record;
  const l = result.ledger;
  return (
    <div className={`panel relative isolate overflow-hidden p-6 ${h.tone === "ok" ? "shadow-[var(--shadow-2)]" : ""}`} role="status" aria-live="polite">
      {h.tone === "ok" && <GuillocheBand className="absolute inset-0 -z-10 h-full w-full text-green opacity-[0.12]" />}
      <div className="flex items-start gap-5">
        {h.tone === "ok" ? (
          <Seal label="Fully verified" className="h-20 w-20 flex-none" />
        ) : (
          <div
            className={`grid h-20 w-20 flex-none place-items-center rounded-full border-2 ${h.tone === "bad" ? "border-error text-error" : "border-warning text-warning"}`}
            aria-hidden="true"
          >
            {h.tone === "bad" ? (
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                <path d="M7 7l10 10M17 7L7 17" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <circle cx="12" cy="12" r="8" />
                <path d="M12 8v4.5l3 1.8" />
              </svg>
            )}
          </div>
        )}
        <div className="min-w-0">
          <h2 className={`page-title !text-[26px] ${h.tone === "bad" ? "text-error" : ""}`}>{h.title}</h2>
          <p className="mt-1.5 text-[14.5px] text-ink-2">{h.body}</p>
          {result.isUnsignedOriginal && (
            <p className="mt-2 text-[13.5px] text-muted">This looks like the original upload of a signed document. Check the signed PDF instead.</p>
          )}
          {!checkedFile && r && <p className="mt-2 text-[13.5px] text-muted">Drop the PDF below to confirm the file itself.</p>}
        </div>
      </div>

      {result.chain && result.chain.length > 0 && r && r.totalSteps > 1 && (
        <section aria-label="Approval route" className="mt-6 border-t border-dashed border-rule-strong pt-5">
          <h3 className="label-caps mb-3">Approval route</h3>
          <ol className="space-y-3">
            {result.chain.map((s) => (
              <li key={s.code} className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold">
                    <span className="mono mr-2 text-[12px] text-muted">
                      {s.stepOrder}/{s.totalSteps}
                    </span>
                    {s.stepLabel} · {s.signerName}
                  </div>
                  <div className="mono text-[11.5px] text-muted">
                    {fmtStamp(s.signedAt)} · {s.code}
                  </div>
                </div>
                <span className={`status ${s.signature === "VALID" ? "status-active" : "status-error"}`}>{s.signature === "VALID" ? "Signature valid" : s.signature.toLowerCase().replace("_", " ")}</span>
                <LedgerStatus status={s.ledger.state} />
              </li>
            ))}
            {r.stepOrder < r.totalSteps && (
              <li className="text-[13.5px] text-muted">
                <span className="mono mr-2 text-[12px]">
                  {r.stepOrder + 1}/{r.totalSteps}
                </span>
                {result.nextStepLabel ?? "Next approver"} · not signed yet
              </li>
            )}
          </ol>
        </section>
      )}

      {r && (
        <div className="mt-6 grid gap-5 border-t border-dashed border-rule-strong pt-5 md:grid-cols-2">
          <section aria-label="Signature">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="label-caps">Signature</h3>
              <span className={`status ${result.status === "VALID" ? "status-active" : "status-error"}`}>
                {result.status === "VALID" ? "Valid" : result.status === "REVOKED" ? "Revoked" : "Invalid"}
              </span>
            </div>
            <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-[13.5px]">
              <dt className="text-muted">Code</dt>
              <dd className="mono font-semibold">{r.code}</dd>
              <dt className="text-muted">Decision</dt>
              <dd>{r.decision === "APPROVED" ? "Approved" : r.decision}</dd>
              <dt className="text-muted">Document type</dt>
              <dd>{r.documentType}</dd>
              <dt className="text-muted">Class</dt>
              <dd>{r.className}</dd>
              <dt className="text-muted">Signed by</dt>
              <dd>{r.signerName}</dd>
              <dt className="text-muted">Signed at</dt>
              <dd className="mono text-[12.5px]">{fmtStamp(r.signedAt)}</dd>
              <dt className="text-muted">Version</dt>
              <dd className="mono">v{r.versionNumber}</dd>
              <dt className="text-muted">Key</dt>
              <dd className="text-[12px]">
                <span className="mono break-all">{r.signerKeyId}</span>{" "}
                <span className="whitespace-nowrap text-muted">· {r.credentialStatus.toLowerCase()}</span>
              </dd>
            </dl>
          </section>
          <section aria-label="Blockchain record">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="label-caps">Blockchain record</h3>
              {l && <LedgerStatus status={l.state} />}
            </div>
            <dl className="grid grid-cols-[130px_1fr] gap-x-4 gap-y-2 text-[13.5px]">
              <dt className="text-muted">Network</dt>
              <dd>Hyperledger Fabric · campussign</dd>
              <dt className="text-muted">Transaction</dt>
              <dd className="mono break-all text-[12px]">{l?.txId ?? "not yet recorded"}</dd>
              {l?.blockNumber && (
                <>
                  <dt className="text-muted">Block</dt>
                  <dd className="mono">{l.blockNumber}</dd>
                </>
              )}
              {l?.onChainAt && (
                <>
                  <dt className="text-muted">Recorded at</dt>
                  <dd className="mono text-[12.5px]">{fmtStamp(l.onChainAt)}</dd>
                </>
              )}
              <dt className="text-muted">Signed SHA-256</dt>
              <dd>
                <Hash value={r.signedSha256} />
              </dd>
              <dt className="text-muted">Original SHA-256</dt>
              <dd>
                <Hash value={r.originalSha256} />
              </dd>
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
