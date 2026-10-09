import type { Metadata } from "next";
import Link from "next/link";
import { verifyCode } from "@/server/signing";
import { VerifyResultCard } from "@/components/verify-result";
import { VerifyDropzone } from "../verify-client";

export const metadata: Metadata = { title: "Signature certificate" };

export default async function CertificatePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const result = await verifyCode(decodeURIComponent(code));

  return (
    <div className="space-y-8">
      <div>
        <div className="micro">Signature certificate</div>
        <h1 className="page-title mt-1 !text-[30px]">{result ? result.record!.code : "Unknown code"}</h1>
      </div>
      {result ? (
        <VerifyResultCard result={result} checkedFile={false} />
      ) : (
        <div className="panel p-6">
          <p className="text-ink-2">No CampusSign signature has this code. Check it against the certificate page of the PDF.</p>
          <Link href="/verify" className="btn btn-secondary mt-4">
            Verify a file instead
          </Link>
        </div>
      )}
      {result && (
        <section className="space-y-3">
          <h2 className="heading text-[18px]">Check the file itself</h2>
          <VerifyDropzone />
        </section>
      )}
    </div>
  );
}
