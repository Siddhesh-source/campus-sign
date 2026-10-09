import type { VerifyResult } from "@/server/signing";
import { GuillocheBand, Seal } from "./guilloche";
import { Hash } from "./doc-ui";
import { fmtStamp } from "@/lib/format";

const HEAD: Record<VerifyResult["status"], { title: string; body: string; tone: "ok" | "bad" }> = {
  VALID: { title: "Valid signature", body: "This file is exactly what was approved and signed. Not one byte has changed.", tone: "ok" },
  MODIFIED_OR_UNKNOWN: {
    title: "Not verified",
    body: "This file doesn't match any document signed through CampusSign. It was changed after signing, or it was never signed here.",
    tone: "bad",
  },
  REVOKED: {
    title: "Signature revoked",
    body: "The file is unchanged, but the signer's key has been revoked, so this signature can no longer be trusted.",
    tone: "bad",
  },
  INVALID_SIGNATURE: {
    title: "Signature invalid",
    body: "The signing record doesn't match its cryptographic signature. Treat this document as untrusted.",
    tone: "bad",
  },
};

/** Public result card. Shows no student identity by design. */
export function VerifyResultCard({ result, checkedFile }: { result: VerifyResult; checkedFile: boolean }) {
  const base = HEAD[result.status];
  // A code lookup proves the record, not the bytes in someone's hand.
  const h =
    !checkedFile && result.status === "VALID"
      ? { ...base, title: "Genuine signing record", body: "This code belongs to a document approved and signed through CampusSign, and the signature checks out." }
      : base;
  const r = result.record;
  return (
    <div className={`panel relative isolate overflow-hidden p-6 ${h.tone === "ok" ? "shadow-[var(--shadow-2)]" : ""}`} role="status" aria-live="polite">
      {h.tone === "ok" && <GuillocheBand className="absolute inset-0 -z-10 h-full w-full text-green opacity-[0.12]" />}
      <div className="flex items-start gap-5">
        {h.tone === "ok" ? (
          <Seal label="Valid" className="h-20 w-20 flex-none" />
        ) : (
          <div className="grid h-20 w-20 flex-none place-items-center rounded-full border-2 border-error text-error" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M7 7l10 10M17 7L7 17" />
            </svg>
          </div>
        )}
        <div className="min-w-0">
          <h2 className={`page-title !text-[26px] ${h.tone === "ok" ? "" : "text-error"}`}>{h.title}</h2>
          <p className="mt-1.5 text-[14.5px] text-ink-2">{h.body}</p>
          {result.isUnsignedOriginal && (
            <p className="mt-2 text-[13.5px] text-muted">
              This looks like the original upload of a signed document. Check the signed PDF instead.
            </p>
          )}
          {!checkedFile && r && (
            <p className="mt-2 text-[13.5px] text-muted">Code lookup confirms the record. Drop the PDF on the verify page to confirm the file itself.</p>
          )}
        </div>
      </div>

      {r && (
        <dl className="mt-6 grid gap-x-6 gap-y-3 border-t border-dashed border-rule-strong pt-5 text-[13.5px] sm:grid-cols-[160px_1fr]">
          <dt className="label-caps self-center">Verification code</dt>
          <dd className="mono font-semibold">{r.code}</dd>
          <dt className="label-caps self-center">Decision</dt>
          <dd>{r.decision === "APPROVED" ? "Approved" : r.decision}</dd>
          <dt className="label-caps self-center">Document type</dt>
          <dd>{r.documentType}</dd>
          <dt className="label-caps self-center">Class</dt>
          <dd>{r.className}</dd>
          <dt className="label-caps self-center">Signed by</dt>
          <dd>{r.signerName}</dd>
          <dt className="label-caps self-center">Signed at</dt>
          <dd className="mono text-[12.5px]">{fmtStamp(r.signedAt)}</dd>
          <dt className="label-caps self-center">Version</dt>
          <dd className="mono">v{r.versionNumber}</dd>
          <dt className="label-caps self-center">Signing key</dt>
          <dd className="mono text-[12.5px]">
            {r.signerKeyId} <span className={`status ml-2 ${r.credentialStatus === "REVOKED" ? "status-error" : r.credentialStatus === "ACTIVE" ? "status-active" : "status-off"}`}>{r.credentialStatus.toLowerCase()}</span>
          </dd>
          <dt className="label-caps self-start pt-0.5">Signed file SHA-256</dt>
          <dd>
            <Hash value={r.signedSha256} full />
          </dd>
          <dt className="label-caps self-start pt-0.5">Original SHA-256</dt>
          <dd>
            <Hash value={r.originalSha256} full />
          </dd>
        </dl>
      )}
    </div>
  );
}
