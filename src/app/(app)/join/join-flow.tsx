"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { joinClassAction, lookupCodeAction } from "@/app/actions";
import type { ClassPreview } from "@/server/enrollment";
import { VerifiedBadge } from "@/components/brand";
import { classLine, fmtDate, fmtStamp, initials } from "@/lib/format";

type Step =
  | { kind: "enter" }
  | { kind: "preview"; preview: ClassPreview }
  | { kind: "joined"; preview: ClassPreview; enrollmentId: string; joinedAt: Date };

export function JoinFlow({
  initialCode,
  studentEmail,
  seal,
  band,
}: {
  initialCode: string;
  studentEmail: string;
  seal: React.ReactNode;
  band: React.ReactNode;
}) {
  const [code, setCode] = useState(initialCode);
  const [step, setStep] = useState<Step>({ kind: "enter" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const autoLooked = useRef(false);

  function lookup(value: string) {
    setError(null);
    start(async () => {
      const res = await lookupCodeAction(value);
      if (res.ok) setStep({ kind: "preview", preview: res.data });
      else setError(res.error);
    });
  }

  useEffect(() => {
    if (initialCode && !autoLooked.current) {
      autoLooked.current = true;
      lookup(initialCode);
    }
  }, [initialCode]);

  const stepNo = step.kind === "enter" ? 1 : step.kind === "preview" ? 2 : 3;

  return (
    <div>
      <div className="micro mb-4" aria-hidden="true">
        Step {stepNo} / 3
      </div>

      {step.kind === "enter" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            lookup(code);
          }}
          className="space-y-5"
        >
          <div>
            <h1 className="page-title">Join a class</h1>
            <p className="mt-2 text-ink-2">Enter the code your faculty shared. You&apos;ll see the class before anything happens.</p>
          </div>
          <div className="field">
            <label htmlFor="code">Class code</label>
            <input
              id="code"
              name="code"
              className="input input-code !min-h-[54px] text-center !text-[20px]"
              placeholder="VIT-CS26-K7P9Q"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-invalid={error ? true : undefined}
              aria-describedby="code-help"
            />
            <span id="code-help" className={error ? "field-error" : "hint"} role={error ? "alert" : undefined}>
              {error ?? "Dashes and capitals don't matter."}
            </span>
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={pending || !code.trim()}>
            {pending ? "Looking up…" : "Look up class"}
          </button>
        </form>
      )}

      {step.kind === "preview" && (
        <Preview
          preview={step.preview}
          band={band}
          pending={pending}
          error={error}
          onBack={() => {
            setError(null);
            setStep({ kind: "enter" });
          }}
          onJoin={() => {
            setError(null);
            start(async () => {
              const res = await joinClassAction(step.preview.code);
              if (res.ok) {
                setStep({ kind: "joined", preview: step.preview, enrollmentId: res.data.enrollmentId, joinedAt: res.data.joinedAt });
              } else {
                setError(res.error);
              }
            });
          }}
        />
      )}

      {step.kind === "joined" && (
        <div className="space-y-5 text-center">
          <div className="grid place-items-center pt-2">{seal}</div>
          <div>
            <h1 className="page-title">You&apos;re in</h1>
            <p className="mt-2 text-ink-2">
              {step.preview.name} is on your dashboard. {step.preview.faculty.name} can now see you on the class roster.
            </p>
          </div>
          <div className="mono border-t border-dashed border-rule-strong pt-3 text-left text-[12px] leading-[1.8] text-muted">
            ENR <b className="font-medium text-ink">{step.enrollmentId.slice(-10)}</b>
            <br />
            AT <b className="font-medium text-ink">{fmtStamp(step.joinedAt)}</b>
            <br />
            BY <b className="font-medium text-ink">{studentEmail}</b>
          </div>
          <Link href="/dashboard" className="btn btn-secondary btn-block">
            Go to my classes
          </Link>
        </div>
      )}
    </div>
  );
}

function Preview({
  preview: p,
  band,
  pending,
  error,
  onBack,
  onJoin,
}: {
  preview: ClassPreview;
  band: React.ReactNode;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onJoin: () => void;
}) {
  const full = p.enrolled >= p.studentLimit;
  const blocked = p.membership === "ACTIVE" || p.membership === "REMOVED" || full;

  return (
    <div className="space-y-5">
      <h1 className="page-title">Is this your class?</h1>
      <div className="panel relative isolate overflow-hidden p-4 sm:p-5">
        {band}
        <div className="micro">
          {p.subjectCode} · {p.academicYear.replace("-", "–")}
        </div>
        <h2 className="heading mt-1.5 text-[19px] leading-tight">{p.name}</h2>
        <div className="mt-1 text-[13.5px] text-ink-2">
          {classLine(p)} · <span className="mono">{p.enrolled}</span> of <span className="mono">{p.studentLimit}</span> seats taken
        </div>
        {p.description && <p className="mt-3 text-[13.5px] text-ink-2">{p.description}</p>}
        <div className="mt-4 flex items-center gap-3 border-t border-dashed border-rule-strong pt-3">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-[4px] bg-sunken font-display text-[13px] font-bold text-ink-2">
            {initials(p.faculty.name)}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold">{p.faculty.name}</div>
            <div className="mono truncate text-[11.5px] text-muted">{p.faculty.email}</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {p.faculty.verified ? (
            <VerifiedBadge />
          ) : (
            <span className="status status-warn">Faculty not verified by admin</span>
          )}
          <span className="mono text-[11.5px] text-muted">{p.expiresAt ? `Code valid until ${fmtDate(p.expiresAt)}` : "Code has no expiry"}</span>
        </div>
      </div>

      {p.membership === "ACTIVE" && <div className="notice notice-ok">You&apos;re already in this class.</div>}
      {p.membership === "REMOVED" && (
        <div className="notice notice-error">Your faculty removed you from this class. Talk to them if that&apos;s a mistake.</div>
      )}
      {full && p.membership !== "ACTIVE" && (
        <div className="notice notice-error">This class is full. Ask {p.faculty.name} to raise the seat limit.</div>
      )}
      {!blocked && <p className="text-[13.5px] text-muted">You&apos;ll be added right away. You can leave the class later from your dashboard.</p>}
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button type="button" className="btn btn-ghost" onClick={onBack} disabled={pending}>
          Use a different code
        </button>
        {p.membership === "ACTIVE" ? (
          <Link href="/dashboard" className="btn btn-primary">
            Go to my classes
          </Link>
        ) : (
          <button type="button" className="btn btn-primary min-h-[46px] sm:min-w-[180px]" onClick={onJoin} disabled={pending || blocked}>
            {pending ? "Joining…" : "Join class"}
          </button>
        )}
      </div>
    </div>
  );
}
