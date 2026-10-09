# Setting up CampusSign

This takes you from a fresh machine to a working pilot with sign-in, classes, submissions, multi-step signing, the blockchain layer, and public verification. Tested on Windows 11 (Git Bash), and it works the same on macOS and Linux.

## 1. Prerequisites

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22 LTS | App, scripts, tests |
| pnpm | 10 | Package manager (`corepack enable`) |
| Docker Desktop | recent, with Compose v2 | Postgres and the Hyperledger Fabric network |
| Git Bash (Windows) or any POSIX shell | | `pnpm ledger:*` and `ops:*` scripts |
| Google Chrome | | Running E2E tests with `PW_CHANNEL=chrome` |

Nothing else needs installing. Fabric's CLI tools run inside the `hyperledger/fabric-tools` container.

## 2. Install and configure

```bash
git clone https://github.com/Siddhesh-source/campus-sign.git
cd campus-sign
pnpm install                      # also generates the Prisma client
cp .env.example .env
```

Edit `.env`:

| Variable | What to put |
|---|---|
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `SIGNING_KEK` | `openssl rand -base64 32`. This encrypts every faculty signing key, so keep it in a secret manager. |
| `ADMIN_EMAILS` | Comma-separated admin emails (they get the Admin role on sign-in) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | A Google OAuth client in VIT's Workspace. Leave empty locally and use dev sign-in. |
| `CAMPUSIGN_DEV_AUTH` | `1` locally for preset sign-ins. **Must be empty in production**: the app refuses to start otherwise. |
| `LEDGER_MODE` | `fabric` to use the blockchain, or `off` to queue events without sending them |

## 3. Database and demo data

```bash
pnpm setup        # starts Postgres (port 54329), applies migrations, seeds the pilot data
```

The seed creates two verified faculty members (`ananya.kulkarni@vit.edu`, `hod.cs@vit.edu`) and an **Internship NOC** document type that routes **class faculty → HoD**.

## 4. Blockchain (Hyperledger Fabric)

```bash
pnpm ledger:up    # ~2 min first time: crypto, 1 orderer + 2 peer orgs, channel, chaincode
pnpm ledger:smoke # writes and reads a probe event in the isolated test namespace
```

Skip this and set `LEDGER_MODE=off` if you only want the app. Documents will then never show "Fully verified", which is correct, because nothing was confirmed on-chain.

## 5. Run

```bash
pnpm dev                 # http://localhost:3000
pnpm ledger:relay        # optional worker; the app also relays right after each decision
```

On `/sign-in`, the development panel signs you in as a **Student**, **Faculty** (Ananya, seeded), or **Admin**. To sign in as anyone else, type any `@vit.edu` email, for example `hod.cs@vit.edu` for the HoD.

### First walk-through

1. **Faculty:** go to **Signing key** and create a key. Then go to **New class**, create a class, and copy its code.
2. **Student:** use **Join a class** with that code. Then go to **Documents → New submission**, choose *Internship NOC*, upload a PDF, and submit.
3. **Faculty:** in the **Inbox**, open the document, choose **Approve**, confirm, and sign. It moves to the HoD.
4. **HoD** (`hod.cs@vit.edu`): create a signing key, then approve and sign from the Inbox.
5. **Student:** download the signed PDF. Then open `/verify` signed out and drop the PDF. It reads **Fully verified** once the blockchain confirms.
6. **Admin:** visit Document types, Signing keys, Audit log, and Blockchain.

## 6. Tests

```bash
pnpm typecheck && pnpm lint
pnpm test                                        # integration suite (separate campusign_test database)
LEDGER_IT=1 pnpm test tests/fabric.it.test.ts    # against the running Fabric network
PW_CHANNEL=chrome pnpm e2e                       # full journeys + accessibility, desktop and phone (needs pnpm dev running or will start it)
```

## 7. Production checklist (pilot)

- [ ] Google OAuth client restricted to `vit.edu`, with the redirect URI `https://<host>/api/auth/callback/google`
- [ ] `CAMPUSIGN_DEV_AUTH` unset, and `NODE_ENV=production`
- [ ] Secrets (`BETTER_AUTH_SECRET`, `SIGNING_KEK`) in a secret manager, not in files
- [ ] `STORAGE_DIR` on encrypted, backed-up storage
- [ ] `pnpm build && pnpm start` behind HTTPS
- [ ] `pnpm ledger:relay` running as a service, plus a daily `pnpm ledger:reconcile`
- [ ] Daily `pnpm ops:backup` and a monthly restore drill ([runbook](operations/runbook.md))
- [ ] The legal open questions answered ([open-questions](legal/open-questions.md))
- [ ] A production Fabric network (CA-issued identities, multiple orderers); see `TODOS.md`

## Troubleshooting

| Symptom | Fix |
|---|---|
| `P1000` auth error on port 5433 | Another Postgres is on 5433. This project uses **54329**, so check `DATABASE_URL`. |
| "Another next dev server is already running" | Stop all `next dev` processes, then start one. |
| Ledger stuck "awaiting confirmation" | `pnpm ledger:up` (network down?), then Admin › Blockchain › Deliver pending now |
| Pages 500 after a schema change | Restart `pnpm dev`, which caches the Prisma client. |
| Playwright can't find a browser | Use `PW_CHANNEL=chrome` (system Chrome) |
