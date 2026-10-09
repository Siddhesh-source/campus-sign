"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PdfPicker } from "@/components/pdf-picker";

type Opt = { id: string; label: string };

export function NewDocumentForm({ classes, types, defaultClassId }: { classes: Opt[]; types: Opt[]; defaultClassId?: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    const form = new FormData(e.currentTarget);
    if (!file) {
      setFieldErrors({ file: "Choose a PDF to upload." });
      return;
    }
    form.set("file", file);
    setPending(true);
    const res = await fetch("/api/documents", { method: "POST", body: form });
    const body = await res.json().catch(() => null);
    if (body?.ok) {
      router.push(`/documents/${body.data.documentId}?uploaded=1`);
      return;
    }
    setPending(false);
    setError(body?.fieldErrors ? null : (body?.error ?? "Upload failed. Try again."));
    setFieldErrors(body?.fieldErrors ?? {});
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      {error && (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      )}
      <label className="field">
        <span className="field-label">Class</span>
        <select name="classId" className="input" defaultValue={defaultClassId ?? classes[0]?.id} aria-invalid={!!fieldErrors.classId || undefined}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {fieldErrors.classId && <span className="field-error">{fieldErrors.classId}</span>}
      </label>
      <label className="field">
        <span className="field-label">Document type</span>
        <select name="typeId" className="input" defaultValue="" aria-invalid={!!fieldErrors.typeId || undefined}>
          <option value="" disabled>
            Choose a type…
          </option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {fieldErrors.typeId && <span className="field-error">{fieldErrors.typeId}</span>}
      </label>
      <label className="field">
        <span className="field-label">Title</span>
        <input name="title" className="input" placeholder="Lab 3: Graph traversal" maxLength={140} aria-invalid={!!fieldErrors.title || undefined} />
        {fieldErrors.title ? <span className="field-error">{fieldErrors.title}</span> : <span className="hint">Your faculty sees this in their inbox.</span>}
      </label>
      <PdfPicker file={file} onChange={setFile} error={fieldErrors.file} />
      <div>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Uploading…" : "Upload and preview"}
        </button>
        <p className="hint mt-2">Nothing goes to your faculty until you press Submit on the next screen.</p>
      </div>
    </form>
  );
}
