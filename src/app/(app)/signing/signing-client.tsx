"use client";

import { useState, useTransition } from "react";
import { createCredentialAction, revokeCredentialAction, rotateCredentialAction } from "@/app/actions";

export function CredentialActions({ hasActive }: { hasActive: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        className={`btn ${hasActive ? "btn-secondary" : "btn-primary"}`}
        disabled={pending}
        onClick={() => {
          if (hasActive && !window.confirm("Rotate your key? Past signatures keep verifying; new approvals use the new key.")) return;
          start(async () => {
            const res = hasActive ? await rotateCredentialAction() : await createCredentialAction();
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Working…" : hasActive ? "Rotate key" : "Create signing key"}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function RevokeButton({ id, keyId }: { id: string; keyId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className="btn btn-danger btn-sm"
        disabled={pending}
        onClick={() => {
          const reason = window.prompt(`Revoke ${keyId}? Every document it signed will fail verification. Reason:`);
          if (reason === null) return;
          start(async () => {
            const res = await revokeCredentialAction(id, reason || "Revoked by owner");
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Revoking…" : "Revoke"}
      </button>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
