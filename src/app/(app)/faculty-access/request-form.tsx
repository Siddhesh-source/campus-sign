"use client";

import { useActionState } from "react";
import { requestFacultyAccessAction } from "@/app/actions";

export function RequestAccessForm() {
  const [state, action, pending] = useActionState(requestFacultyAccessAction, null);
  const fieldError = state && !state.ok ? state.fieldErrors?.department : undefined;
  return (
    <form action={action} className="space-y-4">
      <label className="field">
        <span className="field-label">Department</span>
        <input name="department" className="input" placeholder="Computer Engineering" maxLength={80} aria-invalid={!!fieldError || undefined} />
        {fieldError ? <span className="field-error">{fieldError}</span> : <span className="hint">Helps the admin confirm who you are.</span>}
      </label>
      {state && !state.ok && !fieldError && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Sending…" : "Request faculty access"}
      </button>
    </form>
  );
}
