import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { INSTITUTION_DOMAIN } from "@/server/auth";

export const metadata: Metadata = { title: "Can't sign in" };

export default async function DeniedPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-[460px] space-y-6">
        <Wordmark />
        <div className="panel space-y-3 p-6">
          <h1 className="page-title !text-[26px]">That account can&apos;t sign in</h1>
          <p className="text-ink-2">
            CampusSign only accepts Google accounts managed by VIT (<span className="mono">@{INSTITUTION_DOMAIN}</span>). Personal
            Gmail accounts and suspended accounts are turned away.
          </p>
          <p className="text-[13.5px] text-muted">
            Signed in with the wrong account? Sign out of Google, then try again with your institute email.
          </p>
          {error && <p className="micro">Reason: {error.slice(0, 60)}</p>}
        </div>
        <Link href="/sign-in" className="btn btn-primary">
          Back to sign in
        </Link>
      </div>
    </main>
  );
}
