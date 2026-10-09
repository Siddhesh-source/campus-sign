"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function GoogleButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <button
        type="button"
        className="btn btn-secondary btn-block !text-[15px]"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await authClient.signIn.social({ provider: "google", callbackURL: "/dashboard", errorCallbackURL: "/denied" });
          if (res.error) {
            setError(res.error.message ?? "Couldn't reach Google. Try again.");
            setPending(false);
          }
        }}
      >
        <svg viewBox="0 0 48 48" className="!h-[18px] !w-[18px]" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4 7.1-10 7.1-17.5z" />
          <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
          <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
        </svg>
        {pending ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

const PRESETS = [
  { label: "Student", name: "Aarav Sharma", email: "aarav.sharma23@vit.edu" },
  { label: "Faculty", name: "Ananya Kulkarni", email: "ananya.kulkarni@vit.edu" },
  { label: "Admin", name: "Registrar Admin", email: "admin@vit.edu" },
];

/** Rendered only when the server allows dev sign-in (never in production). */
export function DevSignInForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: string, n: string) {
    setPending(true);
    setError(null);
    const res = await fetch("/api/auth/dev/sign-in", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: e, name: n }),
    });
    if (res.ok) {
      // Full navigation so every server component re-reads the new session cookie.
      window.location.replace(new URL("/dashboard", window.location.origin).href);
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.message ?? "Sign-in failed.");
    setPending(false);
  }

  return (
    <div className="rounded-md border border-dashed border-rule-strong p-4">
      <div className="micro mb-3">Development sign-in · disabled in production</div>
      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.email} type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => signIn(p.email, p.name)}>
            {p.label}
          </button>
        ))}
      </div>
      <form
        className="grid gap-2"
        onSubmit={(ev) => {
          ev.preventDefault();
          signIn(email, name || email.split("@")[0]);
        }}
      >
        <label className="sr-only" htmlFor="dev-email">Email</label>
        <input id="dev-email" className="input mono !text-[13.5px]" placeholder="someone@vit.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="sr-only" htmlFor="dev-name">Name</label>
        <input id="dev-name" className="input !text-[13.5px]" placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-ghost btn-sm justify-self-start" disabled={pending || !email}>
          Sign in as this account
        </button>
      </form>
      {error && <p className="field-error mt-2" role="alert">{error}</p>}
    </div>
  );
}
