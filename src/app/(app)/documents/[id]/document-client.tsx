"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { submitDocumentAction } from "@/app/actions";
import { PdfPicker } from "@/components/pdf-picker";

export function SubmitPanel({ documentId, versionId, sha256, justUploaded }: { documentId: string; versionId: string; sha256: string; justUploaded: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="panel space-y-3 p-5">
      {justUploaded && (
        <div className="notice notice-ok text-[13.5px]" role="status">
          Uploaded. Check the preview, then submit.
        </div>
      )}
      <h2 className="heading text-[16px]">Ready to submit?</h2>
      <p className="text-[13.5px] text-ink-2">Submitting locks this exact file. Your faculty reviews these bytes, identified by:</p>
      <p className="mono break-all rounded-[4px] bg-sunken px-3 py-2 text-[11.5px] text-ink-2">SHA-256 {sha256}</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await submitDocumentAction(documentId, versionId);
            if (!res.ok) setError(res.error);
          })
        }
      >
        {pending ? "Submitting…" : "Submit for review"}
      </button>
      <NewVersionForm documentId={documentId} label="Replace with a different file" />
    </div>
  );
}

export function NewVersionForm({ documentId, label = "Corrected PDF" }: { documentId: string; label?: string }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(label === "Corrected PDF");

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm -ml-2" onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!file) return setError("Choose a PDF to upload.");
        setPending(true);
        setError(null);
        const form = new FormData();
        form.set("file", file);
        const res = await fetch(`/api/documents/${documentId}/versions`, { method: "POST", body: form });
        const body = await res.json().catch(() => null);
        setPending(false);
        if (body?.ok) {
          setFile(null);
          router.refresh();
        } else setError(body?.error ?? "Upload failed. Try again.");
      }}
    >
      <PdfPicker file={file} onChange={setFile} error={error ?? undefined} label="New version" />
      <button type="submit" className="btn btn-secondary btn-sm" disabled={pending || !file}>
        {pending ? "Uploading…" : "Upload as new version"}
      </button>
    </form>
  );
}
