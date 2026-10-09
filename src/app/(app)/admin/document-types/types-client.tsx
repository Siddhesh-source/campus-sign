"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { createDocumentTypeAction, setRouteAction, updateDocumentTypeAction } from "@/app/actions";

type Step = { label: string; kind: "CLASS_FACULTY" | "DESIGNATED"; approverEmail: string };

export function TypeRow({
  type,
  route,
  facultyEmails,
}: {
  type: { id: string; code: string; name: string; active: boolean; documents: number };
  route: Step[];
  facultyEmails: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[260px]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold">{type.name}</h2>
            {!type.active && <span className="status status-off">Inactive</span>}
          </div>
          <div className="mono text-[11.5px] text-muted">
            {type.code} · {type.documents} document{type.documents === 1 ? "" : "s"}
          </div>
          <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-2" aria-label={`Approval route for ${type.name}`}>
            {route.map((s, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden="true" className="text-faint">→</span>}
                <span className="rounded-[2px] bg-sunken px-2 py-0.5">
                  {s.label}
                  {s.kind === "DESIGNATED" && <span className="mono ml-1 text-[11px] text-muted">{s.approverEmail}</span>}
                </span>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            {editing ? "Close" : "Edit"}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${type.active ? "btn-ghost" : "btn-secondary"}`}
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateDocumentTypeAction(type.id, { active: !type.active });
                setError(r.ok ? null : r.error);
              })
            }
          >
            {type.active ? "Deactivate" : "Activate"}
          </button>
        </div>
      </div>
      {error && (
        <p className="field-error mt-2" role="alert">
          {error}
        </p>
      )}
      {editing && <TypeEditor type={type} route={route} facultyEmails={facultyEmails} onDone={() => setEditing(false)} />}
    </li>
  );
}

function TypeEditor({ type, route, facultyEmails, onDone }: { type: { id: string; name: string }; route: Step[]; facultyEmails: string[]; onDone: () => void }) {
  const [name, setName] = useState(type.name);
  const [steps, setSteps] = useState<Step[]>(route);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const listId = useId();

  const update = (i: number, patch: Partial<Step>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) =>
    setSteps((s) => {
      const n = [...s];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });

  return (
    <form
      className="mt-4 space-y-4 rounded-[6px] border border-rule bg-surface p-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          if (name.trim() !== type.name) {
            const r = await updateDocumentTypeAction(type.id, { name });
            if (!r.ok) return setError(r.error);
          }
          const r = await setRouteAction(type.id, steps.map((s) => ({ ...s, approverEmail: s.kind === "DESIGNATED" ? s.approverEmail : undefined })));
          if (!r.ok) return setError(r.error);
          onDone();
        });
      }}
    >
      <label className="field">
        <span className="field-label">Name</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      </label>
      <fieldset className="space-y-3">
        <legend className="field-label mb-2">Approval route</legend>
        <datalist id={listId}>
          {facultyEmails.map((e) => (
            <option key={e} value={e} />
          ))}
        </datalist>
        {steps.map((s, i) => (
          <div key={i} className="grid gap-2 rounded-[4px] border border-rule p-3 sm:grid-cols-[28px_1fr_170px_1fr_auto] sm:items-end">
            <span className="mono pb-2.5 text-[12px] text-muted" aria-hidden="true">
              {i + 1}.
            </span>
            <label className="field">
              <span className="text-[12.5px] font-semibold">Step name</span>
              <input className="input" value={s.label} onChange={(e) => update(i, { label: e.target.value })} maxLength={60} aria-label={`Step ${i + 1} name`} />
            </label>
            <label className="field">
              <span className="text-[12.5px] font-semibold">Approver</span>
              <select className="input" value={s.kind} onChange={(e) => update(i, { kind: e.target.value as Step["kind"] })} aria-label={`Step ${i + 1} approver type`}>
                <option value="CLASS_FACULTY">Class faculty</option>
                <option value="DESIGNATED">Named person</option>
              </select>
            </label>
            <label className="field">
              <span className="text-[12.5px] font-semibold">Email</span>
              <input
                className="input mono !text-[13px]"
                list={listId}
                disabled={s.kind !== "DESIGNATED"}
                value={s.kind === "DESIGNATED" ? s.approverEmail : ""}
                placeholder={s.kind === "DESIGNATED" ? "hod.cs@vit.edu" : "Whoever owns the class"}
                onChange={(e) => update(i, { approverEmail: e.target.value })}
                aria-label={`Step ${i + 1} approver email`}
              />
            </label>
            <div className="flex gap-1">
              <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`}>
                ↑
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move step ${i + 1} down`}>
                ↓
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={steps.length === 1} onClick={() => setSteps((x) => x.filter((_, j) => j !== i))} aria-label={`Remove step ${i + 1}`}>
                ✕
              </button>
            </div>
          </div>
        ))}
        {steps.length < 5 && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSteps((s) => [...s, { label: "Head of Department", kind: "DESIGNATED", approverEmail: "" }])}>
            Add a step
          </button>
        )}
      </fieldset>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NewTypeForm() {
  const [state, action, pending] = useActionState(createDocumentTypeAction, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form ref={ref} action={action} className="grid gap-4">
      <label className="field">
        <span className="field-label">Name</span>
        <input name="name" className="input" placeholder="Internship NOC" maxLength={80} aria-invalid={!!fe?.name || undefined} />
        {fe?.name && <span className="field-error">{fe.name}</span>}
      </label>
      <label className="field">
        <span className="field-label">Code</span>
        <input name="code" className="input mono uppercase" placeholder="INTERNSHIP_NOC" maxLength={40} aria-invalid={!!fe?.code || undefined} />
        {fe?.code ? <span className="field-error">{fe.code}</span> : <span className="hint">Permanent. Recorded on signatures.</span>}
      </label>
      {state && !state.ok && !fe && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="text-[13px] text-green-ink" role="status">
          Added.
        </p>
      )}
      <button type="submit" className="btn btn-primary" disabled={pending}>
        {pending ? "Adding…" : "Add document type"}
      </button>
    </form>
  );
}
