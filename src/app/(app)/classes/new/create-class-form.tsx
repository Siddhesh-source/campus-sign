"use client";

import { useActionState, useState } from "react";
import { createClassAction } from "@/app/actions";
import { codePrefix, EXPIRY_LABELS, EXPIRY_OPTIONS, YEARS_OF_STUDY } from "@/lib/codes";
import { fmtDate } from "@/lib/format";

export function CreateClassForm({
  facultyName,
  defaultYear,
  band,
}: {
  facultyName: string;
  defaultYear: string;
  band: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(createClassAction, null);
  const [now] = useState(() => Date.now());
  const [v, setV] = useState({
    name: "",
    subjectCode: "",
    academicYear: defaultYear,
    yearOfStudy: "SY",
    division: "",
    description: "",
    studentLimit: "60",
    codeExpiry: "7",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setV((s) => ({ ...s, [k]: e.target.value }));
  const err = (k: string) => (state && !state.ok ? state.fieldErrors?.[k] : undefined);

  const expiry = v.codeExpiry === "never" ? null : new Date(now + Number(v.codeExpiry) * 86_400_000);
  const prefix = codePrefix(v.subjectCode || "", v.academicYear);
  const yearOptions = [-1, 0, 1].map((d) => {
    const y = Number(defaultYear.slice(0, 4)) + d;
    return `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  });

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,560px)_360px]">
      <form action={action} className="grid gap-5" noValidate>
        {state && !state.ok && !state.fieldErrors && (
          <div className="notice notice-error" role="alert">
            {state.error}
          </div>
        )}

        <Field label="Class name" error={err("name")}>
          <input name="name" className="input" value={v.name} onChange={set("name")} placeholder="Data Structures & Algorithms" maxLength={120} required aria-invalid={!!err("name") || undefined} />
        </Field>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Subject code" error={err("subjectCode")} hint="Letters then numbers.">
            <input name="subjectCode" className="input mono uppercase" value={v.subjectCode} onChange={set("subjectCode")} placeholder="CS2101" maxLength={14} required aria-invalid={!!err("subjectCode") || undefined} />
          </Field>
          <Field label="Academic year" error={err("academicYear")}>
            <select name="academicYear" className="input" value={v.academicYear} onChange={set("academicYear")}>
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y.replace("-", "–")}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Year" error={err("yearOfStudy")}>
            <select name="yearOfStudy" className="input" value={v.yearOfStudy} onChange={set("yearOfStudy")}>
              {YEARS_OF_STUDY.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Division" error={err("division")}>
            <input name="division" className="input uppercase" value={v.division} onChange={set("division")} placeholder="B" maxLength={3} required aria-invalid={!!err("division") || undefined} />
          </Field>
        </div>

        <Field label="Description" error={err("description")} hint="Optional. Students see this before they join.">
          <textarea name="description" className="input min-h-[84px] resize-y" value={v.description} onChange={set("description")} maxLength={500} />
        </Field>

        <div className="grid items-start gap-4 sm:grid-cols-2">
          <Field label="Seat limit" error={err("studentLimit")}>
            <input name="studentLimit" type="number" inputMode="numeric" min={1} max={500} className="input mono" value={v.studentLimit} onChange={set("studentLimit")} required aria-invalid={!!err("studentLimit") || undefined} />
          </Field>
          <Field label="Code expires" error={err("codeExpiry")} hint="You can rotate or revoke it any time.">
            <select name="codeExpiry" className="input" value={v.codeExpiry} onChange={set("codeExpiry")}>
              {EXPIRY_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {EXPIRY_LABELS[o]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <p className="text-[13.5px] text-muted">Students who enter the code are added right away, up to the seat limit.</p>

        <div>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Creating…" : "Create class and code"}
          </button>
        </div>
      </form>

      <aside className="xl:sticky xl:top-8 xl:self-start" aria-label="Live preview">
        <div className="panel relative isolate overflow-hidden p-5 shadow-[var(--shadow-2)]">
          {band}
          <div className="micro">Live preview · what students see</div>
          <div className="heading mt-2 text-[17px] leading-tight">{v.name || "Class name"}</div>
          <div className="text-[13px] text-muted">
            {v.yearOfStudy} · Division {v.division.toUpperCase() || "–"} · {v.academicYear.replace("-", "–")}
          </div>
          <div className="text-[13px] text-muted">{facultyName}</div>
          <div className="mono mt-4 mb-1 text-[24px] font-semibold tracking-[0.04em]">
            {prefix}–<span className="text-faint">•••••</span>
          </div>
          <div className="hint">The last five characters are generated when you create the class.</div>
          <div className="mono mt-3 flex flex-wrap gap-3 border-t border-dashed border-rule-strong pt-3 text-[11.5px] tracking-[0.04em] text-muted uppercase">
            <span>{expiry ? `Exp ${fmtDate(expiry)}` : "No expiry"}</span>
            <span>{v.studentLimit || "–"} seats</span>
            <span>Instant join</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? (
        <span className="field-error" role="alert">
          {error}
        </span>
      ) : hint ? (
        <span className="hint">{hint}</span>
      ) : null}
    </label>
  );
}
