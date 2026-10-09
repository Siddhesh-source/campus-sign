# CampusSign

Academic document signing for VIT Pune. Phase 1 covers sign-in, roles, and class enrollment.

- **Students** sign in with any Google-verified `@vit.edu` account. They join classes with a code and are added instantly.
- **Faculty** are verified by an administrator, either added directly or approved from a request. Faculty create classes and manage their join codes.
- **Admins** (from `ADMIN_EMAILS`) approve faculty and read the append-only audit log.

## Run locally

```bash
pnpm install
cp .env.example .env          # set BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm db:up                    # Postgres 18 on localhost:54329
pnpm prisma migrate deploy
pnpm dev                      # http://localhost:3000
```

Without a Google OAuth client, use the **development sign-in** on `/sign-in` (Student / Faculty / Admin presets). It only exists when `CAMPUSIGN_DEV_AUTH=1` and `NODE_ENV` is not `production`. The app refuses to start in production with that flag set, so build with `CAMPUSIGN_DEV_AUTH=` cleared.

## Tests

```bash
pnpm test                     # Vitest integration suite (uses campusign_test DB)
PW_CHANNEL=chrome pnpm e2e    # Playwright: done-criteria on desktop + phone
pnpm typecheck && pnpm lint
```

## Layout

| Path | What |
|---|---|
| `src/server/` | Services: `auth`, `classes`, `enrollment`, `faculty`, `audit`, `rate-limit` (no Next imports except auth) |
| `src/app/(app)/` | Signed-in pages; role checked on the server for every page and action |
| `src/lib/` | Pure helpers shared by server and client (codes, identity, formatting) |
| `prisma/` | Schema and migrations; the init migration adds the one-active-code index and the audit trigger |
| `DESIGN.md` | Design system (read before UI work) |
| `docs/plans/phase-1-plan.md` | Reviewed Phase 1 plan |

## Security notes

- Google sign-in requires `email_verified` and `hd = vit.edu`, checked server-side by Better Auth's Google provider and again in a user-create hook.
- Roles are read from the database on every request. Sessions live in the database, so revoking access takes effect immediately.
- Join codes use 31 symbols with no ambiguous characters. Lookups require a signed-in student and are rate-limited per user (5 failures per 15 min, with doubling lockouts) and per IP. Every kind of non-match gets the same response.
- The audit log is written in the same transaction as the action it records. A database trigger rejects UPDATE, DELETE, and TRUNCATE.
- Runbook: to clear a locked-out student, run `DELETE FROM code_lookup_limit WHERE key = 'user:<id>'`.
