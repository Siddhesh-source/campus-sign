"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { addFacultyAction, decideFacultyAction } from "@/app/actions";

export function DecisionButtons({ id, status, email }: { id: string; status: string; email: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function decide(d: "approve" | "reject" | "revoke") {
    if (d === "revoke" && !window.confirm(`Revoke faculty access for ${email}? Their classes stay, but they lose faculty tools.`)) return;
    setError(null);
    start(async () => {
      const res = await decideFacultyAction(id, d);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <span className="inline-flex gap-1.5">
        {status === "PENDING" && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => decide("reject")}>
              Reject
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={pending} onClick={() => decide("approve")}>
              Approve
            </button>
          </>
        )}
        {status === "APPROVED" && (
          <button type="button" className="btn btn-danger btn-sm" disabled={pending} onClick={() => decide("revoke")}>
            Revoke
          </button>
        )}
        {(status === "REJECTED" || status === "REVOKED") && (
          <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => decide("approve")}>
            Approve
          </button>
        )}
      </span>
      {error && <span className="field-error">{error}</span>}
    </span>
  );
}

export function AddFacultyForm() {
  const [state, action, pending] = useActionState(addFacultyAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <form ref={formRef} action={action} className="grid gap-4">
      <label className="field">
        <span className="field-label">Institute email</span>
        <input name="email" type="email" className="input mono !text-[14px]" placeholder="firstname.lastname@vit.edu" required aria-invalid={!!fe?.email || undefined} />
        {fe?.email && <span className="field-error">{fe.email}</span>}
      </label>
      <label className="field">
        <span className="field-label">Department</span>
        <input name="department" className="input" placeholder="Optional" maxLength={80} />
      </label>
      {state && !state.ok && !fe && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-[13px] text-green-ink" role="status">
          Added. They&apos;re verified faculty from their next sign-in.
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add as verified faculty"}
      </button>
    </form>
  );
}
