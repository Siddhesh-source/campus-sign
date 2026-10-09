import Link from "next/link";
import { Wordmark } from "@/components/brand";

export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-4 py-4">
          <Link href="/verify" aria-label="CampusSign verify">
            <Wordmark />
          </Link>
          <Link href="/sign-in" className="btn btn-ghost btn-sm">
            Sign in
          </Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-[860px] px-4 py-10 outline-none sm:py-14">{children}</main>
    </div>
  );
}
