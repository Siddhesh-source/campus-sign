"use client";

import { useState, useTransition } from "react";
import { removeStudentAction, revokeCodeAction, rotateCodeAction, setExpiryAction } from "@/app/actions";
import { EXPIRY_LABELS, EXPIRY_OPTIONS } from "@/lib/codes";

type Msg = { kind: "ok" | "error"; text: string } | null;

export function CodeActions({ classId, code, live, hasCode }: { classId: string; code: string | null; live: boolean; hasCode: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<Msg>(null);
  const [copied, setCopied] = useState(false);
  const [showExpiry, setShowExpiry] = useState(false);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      setMsg(res.ok ? { kind: "ok", text: ok } : { kind: "error", text: res.error ?? "Something went wrong." });
    });
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        {live && code && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <rect x="5" y="5" width="9" height="9" rx="1" />
              <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
            </svg>
            {copied ? "Copied" : "Copy code"}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pending}
          onClick={() => {
            if (hasCode && !window.confirm("Rotate the code? The current code stops working immediately.")) return;
            run(() => rotateCodeAction(classId), hasCode ? "New code issued. The old one no longer works." : "New code issued.");
          }}
        >
          {hasCode ? "Rotate" : "Issue new code"}
        </button>
        {hasCode && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setShowExpiry((s) => !s)} aria-expanded={showExpiry}>
            {live ? "Set expiry" : "Extend"}
          </button>
        )}
        {live && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Revoke this code? Nobody can join until you issue a new one.")) return;
              run(() => revokeCodeAction(classId), "Code revoked.");
            }}
          >
            Revoke
          </button>
        )}
      </div>

      {showExpiry && (
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="expiry" className="sr-only">
            Code expiry
          </label>
          <select
            id="expiry"
            className="input !min-h-[34px] !w-auto !py-1.5 !text-[13px]"
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              run(() => setExpiryAction(classId, v), v === "now" ? "Code expired." : "Expiry updated.");
              setShowExpiry(false);
            }}
          >
            <option value="" disabled>
              Choose…
            </option>
            {EXPIRY_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o === "never" ? "Never expires" : EXPIRY_LABELS[o].replace("In ", "Expires in ")}
              </option>
            ))}
            {live && <option value="now">Expire now</option>}
          </select>
        </div>
      )}

      {msg && (
        <p className={msg.kind === "ok" ? "text-[13px] text-green-ink" : "field-error"} role={msg.kind === "error" ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

export function RemoveStudentButton({ classId, enrollmentId, name }: { classId: string; enrollmentId: string; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        className="btn btn-ghost btn-sm text-muted"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Remove ${name} from this class? They won't be able to rejoin with the code.`)) return;
          start(async () => {
            const res = await removeStudentAction(classId, enrollmentId);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}
