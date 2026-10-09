import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { GuillocheRosette } from "@/components/guilloche";
import { devAuthEnabled, getCurrentUser, googleConfigured, INSTITUTION_DOMAIN } from "@/server/auth";
import { DevSignInForm, GoogleButton } from "./sign-in-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const google = googleConfigured();
  const dev = devAuthEnabled();

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1fr_1fr]">
      <section className="relative isolate hidden flex-col justify-between overflow-hidden bg-green p-10 text-[var(--on-green)] lg:flex">
        <GuillocheRosette large className="absolute -inset-[10%] -z-10 h-[120%] w-[120%] opacity-[0.16]" />
        <Wordmark className="[&_svg]:text-[var(--on-green)]" />
        <p className="max-w-[16ch] font-display text-[40px] leading-[1.04] font-extrabold tracking-[-0.03em]">
          Forms signed once, verifiable forever.
        </p>
        <p className="micro !text-[color-mix(in_srgb,var(--on-green)_70%,transparent)]">
          Vishwakarma Institute of Technology, Pune
        </p>
      </section>

      <section className="flex items-center justify-center bg-surface px-4 py-12 sm:px-10">
        <div className="w-full max-w-[400px] space-y-6">
          <div className="lg:hidden">
            <Wordmark />
          </div>
          <div className="space-y-2">
            <h1 className="page-title !text-[32px]">Sign in to CampusSign</h1>
            <p className="text-ink-2">
              Use your institute Google account. Your role comes from VIT records, so there&apos;s nothing to choose here.
            </p>
          </div>

          {google ? (
            <GoogleButton />
          ) : (
            <div className="notice notice-warn text-[13.5px]">
              Google sign-in isn&apos;t configured on this server yet. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
            </div>
          )}

          <p className="flex items-start gap-2 text-[13px] text-muted">
            <svg viewBox="0 0 20 20" className="mt-0.5 h-4 w-4 flex-none text-green" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <path d="M10 2l6.5 2.5v5c0 4-2.8 7-6.5 8.5C6.3 16.5 3.5 13.5 3.5 9.5v-5z" strokeLinejoin="round" />
              <path d="M7 10l2 2 4-4.5" strokeLinecap="round" />
            </svg>
            <span>
              Only <span className="mono text-ink">@{INSTITUTION_DOMAIN}</span> accounts verified by Google can sign in.
              Personal accounts are turned away.
            </span>
          </p>

          {dev && <DevSignInForm />}
        </div>
      </section>
    </main>
  );
}
