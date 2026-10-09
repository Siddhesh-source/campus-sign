import type { CurrentUser } from "@/server/auth";
import { Wordmark } from "./brand";
import { NavLink, SignOutButton } from "./app-shell-client";

type NavItem = { href: string; label: string; exact?: boolean };

function navFor(user: CurrentUser): NavItem[] {
  switch (user.role) {
    case "ADMIN":
      return [
        { href: "/admin", label: "Faculty access", exact: true },
        { href: "/admin/document-types", label: "Document types" },
        { href: "/admin/credentials", label: "Signing keys" },
        { href: "/admin/audit", label: "Audit log" },
        { href: "/admin/ledger", label: "Blockchain" },
      ];
    case "FACULTY":
      return [
        { href: "/inbox", label: "Inbox" },
        { href: "/dashboard", label: "Classes", exact: true },
        { href: "/classes/new", label: "New class" },
        { href: "/signing", label: "Signing key" },
        { href: "/activity", label: "Activity" },
      ];
    default:
      return [
        { href: "/dashboard", label: "My classes", exact: true },
        { href: "/documents", label: "Documents" },
        { href: "/join", label: "Join a class" },
        { href: "/activity", label: "Activity" },
      ];
  }
}

const roleLabel: Record<CurrentUser["role"], string> = { ADMIN: "Administrator", FACULTY: "Faculty", STUDENT: "Student" };

export function AppShell({ user, children }: { user: CurrentUser; children: React.ReactNode }) {
  const nav = navFor(user);
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[232px_1fr]">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-0.5 border-r border-rule bg-surface px-3 py-5 lg:flex">
        <div className="px-2 pb-6">
          <Wordmark />
        </div>
        <nav className="flex flex-col gap-0.5" aria-label="Primary">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.exact}>
              {item.label}
            </NavLink>
          ))}
          {user.role === "STUDENT" && (
            <NavLink href="/faculty-access">Faculty access</NavLink>
          )}
        </nav>
        <div className="mt-auto space-y-3 border-t border-rule px-2 pt-4">
          <div className="min-w-0">
            <div className="truncate text-[13.5px] font-semibold">{user.name}</div>
            <div className="mono truncate text-[11px] text-muted">{user.email}</div>
            <div className="micro mt-1">{roleLabel[user.role]}</div>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 border-b border-rule bg-surface/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Wordmark className="!text-[16px]" />
          <details className="relative">
            <summary
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-[4px] bg-sunken font-display text-[13px] font-bold text-ink-2"
              aria-label="Account menu"
            >
              {initials}
            </summary>
            <div className="panel absolute right-0 mt-2 w-60 space-y-3 p-3 shadow-[var(--shadow-2)]">
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold">{user.name}</div>
                <div className="mono truncate text-[11px] text-muted">{user.email}</div>
              </div>
              {user.role === "STUDENT" && (
                <a href="/faculty-access" className="block text-[13.5px] text-ink-2 underline-offset-2 hover:underline">
                  Faculty access
                </a>
              )}
              <SignOutButton />
            </div>
          </details>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2" aria-label="Primary">
          {nav.map((item) => (
            <NavLink key={item.href} href={item.href} exact={item.exact} compact>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" tabIndex={-1} className="min-w-0 outline-none">
        {children}
      </main>
    </div>
  );
}
