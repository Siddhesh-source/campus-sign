"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { verifyHashAction } from "@/app/actions";
import type { VerifyResult } from "@/server/signing";
import { VerifyResultCard } from "@/components/verify-result";

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function VerifyDropzone() {
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [pending, start] = useTransition();

  function check(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResult(null);
    setFileName(file.name);
    start(async () => {
      const h = await sha256Hex(file);
      setHash(h);
      const res = await verifyHashAction(h);
      if (res.ok) setResult(res.data);
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-6">
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[6px] border-2 border-dashed px-6 py-12 text-center transition-colors ${
          drag ? "border-green bg-green-tint" : "border-rule-strong bg-surface hover:border-ink-2"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          check(e.dataTransfer.files[0]);
        }}
      >
        <span className="heading text-[18px]">{pending ? "Checking…" : fileName ?? "Drop a signed PDF here"}</span>
        <span className="text-[13.5px] text-muted">or click to choose a file · checked in your browser</span>
        <input type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose a PDF to verify" onChange={(e) => check(e.target.files?.[0])} />
      </label>

      {hash && (
        <p className="mono break-all text-[11.5px] text-muted">
          SHA-256 of {fileName}: {hash}
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      {result && <VerifyResultCard result={result} checkedFile />}

      <p className="text-[13.5px] text-muted">
        Have a verification code instead? Open <span className="mono">/verify/CS-XXXX-XXXX-XXXX</span>, or{" "}
        <Link href="/" className="underline">
          sign in
        </Link>{" "}
        to see your own documents.
      </p>
    </div>
  );
}
