# CampusSign

Academic document signing for VIT Pune.

- **Phase 1:** sign-in, roles, class enrollment
- **Phase 2:** versioned PDF submission and faculty review
- **Phase 3:** Ed25519 signing and public verification
- **Phase 4:** Hyperledger Fabric trust layer

- **Students** sign in with any Google-verified `@vit.edu` account. They join classes with a code and are added instantly.
- **Faculty** are verified by an administrator, either added directly or approved from a request. Faculty create classes and manage their join codes.
- **Admins** (from `ADMIN_EMAILS`) approve faculty and read the append-only audit log.
- **Students** submit PDFs to a class. Each submission is a locked, SHA-256-hashed version. **Faculty** review that exact version, then approve & sign, request corrections, or reject.
- **Anyone** can verify a signed PDF at `/verify` without logging in. The browser hashes the file locally, and only the hash is sent.

## Run locally

```bash
pnpm install
cp .env.example .env          # set BETTER_AUTH_SECRET and SIGNING_KEK (openssl rand -base64 32 each)
pnpm db:up                    # Postgres 18 on localhost:54329
pnpm prisma migrate deploy
pnpm dev                      # http://localhost:3000
```

Without a Google OAuth client, use the **development sign-in** on `/sign-in` (Student / Faculty / Admin presets). It only exists when `CAMPUSIGN_DEV_AUTH=1` and `NODE_ENV` is not `production`. The app refuses to start in production with that flag set, so build with `CAMPUSIGN_DEV_AUTH=` cleared.

## Blockchain (Phase 4)

CampusSign records document events on a permissioned **Hyperledger Fabric** network as a verification layer. Postgres stays the system of record.

```bash
pnpm ledger:up          # 1 orderer + 2 peer orgs, channel `campussign`, chaincode as a service (needs Docker only)
pnpm ledger:relay       # worker: delivers queued events (the app also relays right after each decision)
pnpm ledger:reconcile   # compare Postgres with the ledger; mismatches appear in Admin › Blockchain
pnpm ledger:smoke       # write and read a probe event (isolated `campussign-it` namespace)
pnpm ledger:down
```

- **What goes on-chain:** event id, type (submitted, approved, rejected, corrections requested, key revoked), opaque document and version ids, SHA-256 hashes, the signing key id, and timestamps.
- **What never goes on-chain:** names, PRNs, emails, titles, rejection comments, PDFs, or keys. An allow-list is enforced in both the app and the chaincode.
- **Delivery:** events are written to a transactional outbox together with each decision. The relay delivers them idempotently, using the event id as the key, so crashes and retries can never create duplicate events.
- **What "Fully verified" means:** a valid Ed25519 signature plus a confirmed, matching on-chain record. A decision waiting on the chain is shown as exactly that.

## Tests

```bash
pnpm test                     # Vitest integration suite (uses campusign_test DB)
PW_CHANNEL=chrome pnpm e2e    # Playwright: done-criteria on desktop + phone
LEDGER_IT=1 pnpm test tests/fabric.it.test.ts   # against the real Fabric network
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
| `docs/plans/phase-1-plan.md`, `phase-2-3-plan.md` | Reviewed phase plans |

## Security notes

- Google sign-in requires `email_verified` and `hd = vit.edu`, checked server-side by Better Auth's Google provider and again in a user-create hook.
- Roles are read from the database on every request. Sessions live in the database, so revoking access takes effect immediately.
- Join codes use 31 symbols with no ambiguous characters. Lookups require a signed-in student and are rate-limited per user (5 failures per 15 min, with doubling lockouts) and per IP. Every kind of non-match gets the same response.
- The audit log is written in the same transaction as the action it records. A database trigger rejects UPDATE, DELETE, and TRUNCATE.
- Documents are stored privately in `STORAGE_DIR` (default `./storage`; gitignored and excluded from build output). They are served only through `/api/files/*`, which re-checks access on every request. Other students, other faculty, and admins all get 404.
- Submitted versions are locked by a database trigger. Signatures and document history are append-only.
- Signing keys are Ed25519 key pairs. Private keys are AES-256-GCM-encrypted under `SIGNING_KEK` and never leave the server. A signature binds the original hash, the signed-PDF hash, the version, the decision, the class, and the document type. Verification fails on any byte change, an unknown document, a revoked key, or a tampered record.
- Runbook: to clear a locked-out student, run `DELETE FROM code_lookup_limit WHERE key = 'user:<id>'`.
