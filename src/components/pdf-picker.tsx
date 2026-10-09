"use client";

import { useEffect, useRef, useState } from "react";

const MAX = 10 * 1024 * 1024;

/** File input with a local preview (blob URL) and size/type checks before upload. */
export function PdfPicker({ file, onChange, error, label = "PDF" }: { file: File | null; onChange: (f: File | null) => void; error?: string; label?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  function preview(f: File | null) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = f ? URL.createObjectURL(f) : null;
    setUrl(urlRef.current);
  }
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const err = localError ?? error;
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-[6px] border border-dashed border-rule-strong bg-surface px-4 py-6 text-center hover:border-ink-2">
        <span className="text-[14px] font-semibold">{file ? file.name : "Choose a PDF"}</span>
        <span className="mono text-[11.5px] text-muted">{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : "PDF only · up to 10 MB"}</span>
        <input
          type="file"
          name="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-invalid={!!err || undefined}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setLocalError(null);
            if (f && f.size > MAX) {
              setLocalError("PDFs must be 10 MB or smaller.");
              preview(null);
              onChange(null);
              return;
            }
            if (f && !/\.pdf$/i.test(f.name) && f.type !== "application/pdf") {
              setLocalError("Upload a PDF file.");
              preview(null);
              onChange(null);
              return;
            }
            preview(f);
            onChange(f);
          }}
        />
      </label>
      {err && (
        <span className="field-error" role="alert">
          {err}
        </span>
      )}
      {file && url && <iframe title="Preview of the selected PDF" src={url} className="mt-2 h-[420px] w-full rounded-[6px] border border-rule bg-sunken" />}
    </div>
  );
}
