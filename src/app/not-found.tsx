import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[420px] space-y-5">
        <Wordmark />
        <h1 className="page-title">Nothing here</h1>
        <p className="text-ink-2">That page doesn&apos;t exist, or it belongs to someone else.</p>
        <Link href="/dashboard" className="btn btn-primary">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
