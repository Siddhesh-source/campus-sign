import type { Metadata } from "next";
import { VerifyDropzone } from "./verify-client";

export const metadata: Metadata = {
  title: "Verify a document",
  description: "Check that a CampusSign PDF is exactly what was approved and signed.",
};

export default function VerifyPage() {
  return (
    <div className="space-y-8">
      <div className="max-w-[60ch]">
        <h1 className="page-title !text-[34px]">Verify a signed document</h1>
        <p className="mt-3 text-[15px] text-ink-2">
          Drop a CampusSign PDF to check that it is exactly what the faculty member signed. Your browser fingerprints the file
          locally; only its SHA-256 hash is sent, never the document.
        </p>
      </div>
      <VerifyDropzone />
    </div>
  );
}
