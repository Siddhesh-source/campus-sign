"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { approveAndSignAction, decideDocumentAction } from "@/app/actions";

type Mode = null | "approve" | "REQUEST_CORRECTIONS" | "REJECT";

export function DecisionPanel({
  documentId,
  versionId,
  versionNumber,
  sha256,
  credentialKeyId,
}: {
  documentId: string;
  versionId: string;
  versionNumber: number;
  sha256: string;
  credentialKeyId: string | null;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(m: Mode) {
    setMode(m);
    setError(null);
    setConfirm(false);
  }

  return (
    <div className="panel space-y-4 p-5">
      <h2 className="heading text-[16px]">Your decision</h2>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className={`btn btn-sm ${mode === "approve" ? "btn-primary" : "btn-secondary"}`} onClick={() => choose("approve")} aria-pressed={mode === "approve"}>
          Approve
        </button>
        <button type="button" className={`btn btn-sm ${mode === "REQUEST_CORRECTIONS" ? "btn-primary" : "btn-secondary"}`} onClick={() => choose("REQUEST_CORRECTIONS")} aria-pressed={mode === "REQUEST_CORRECTIONS"}>
          Corrections
        </button>
        <button type="button" className={`btn btn-sm ${mode === "REJECT" ? "btn-primary" : "btn-secondary"}`} onClick={() => choose("REJECT")} aria-pressed={mode === "REJECT"}>
          Reject
        </button>
      </div>

      {mode === "approve" &&
        (credentialKeyId ? (
          <div className="space-y-3">
            <label className="flex items-start gap-2.5 text-[13.5px] text-ink-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--green)]" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
              <span>
                I reviewed version <b className="mono text-ink">{versionNumber}</b> (SHA-256 <span className="mono">{sha256.slice(0, 12)}…</span>) and approve
                it. Sign it with my key <span className="mono">{credentialKeyId}</span>.
              </span>
            </label>
            <button
              type="button"
              className="btn btn-primary btn-block"
              disabled={!confirm || pending}
              onClick={() =>
                start(async () => {
                  const res = await approveAndSignAction(documentId, { versionId, expectedSha256: sha256, confirm });
                  if (!res.ok) setError(res.error);
                })
              }
            >
              {pending ? "Signing…" : "Approve and sign"}
            </button>
          </div>
        ) : (
          <div className="notice notice-warn text-[13.5px]">
            <span>
              You need a signing credential to approve.{" "}
              <Link href="/signing" className="font-semibold underline">
                Create one
              </Link>
              , then come back.
            </span>
          </div>
        ))}

      {(mode === "REQUEST_CORRECTIONS" || mode === "REJECT") && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await decideDocumentAction(documentId, { versionId, decision: mode, reason });
              if (!res.ok) setError(res.error);
            });
          }}
        >
          <label className="field">
            <span className="field-label">{mode === "REJECT" ? "Why are you rejecting it?" : "What should the student fix?"}</span>
            <textarea className="input min-h-[110px] resize-y" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} required />
            <span className="hint">The student sees this exactly as written.</span>
          </label>
          <button type="submit" className={`btn btn-block ${mode === "REJECT" ? "btn-danger" : "btn-primary"}`} disabled={pending || reason.trim().length < 10}>
            {pending ? "Saving…" : mode === "REJECT" ? "Reject document" : "Request corrections"}
          </button>
        </form>
      )}

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
