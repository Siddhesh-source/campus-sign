"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function NavLink({
  href,
  exact,
  compact,
  children,
}: {
  href: string;
  exact?: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  const base = compact
    ? "whitespace-nowrap rounded-[4px] px-3 py-1.5 text-[13.5px] font-medium"
    : "flex items-center rounded-[4px] px-2.5 py-2 text-[14px] font-medium";
  const state = active
    ? `bg-sunken text-ink font-semibold ${compact ? "" : "shadow-[inset_2px_0_0_var(--green)]"}`
    : "text-ink-2 hover:bg-sunken";
  return (
    <Link href={href} className={`${base} ${state}`} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm -ml-2"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        // Full navigation so every server component re-reads the new session cookie.
        window.location.replace(new URL("/sign-in", window.location.origin).href);
      }}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
