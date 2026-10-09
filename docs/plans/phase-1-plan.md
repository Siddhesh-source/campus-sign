# CampusSign Phase 1 — Sign-in, Roles, Class Enrollment

Working plan reviewed by /plan-ceo-review (2026-10-09). Source: user's Phase 1 brief + product brief (chat, 2026-10-09).

## Brief (source of truth)

- Institution-verified sign-in. Role from verified permissions, never user choice. Faculty need admin approval before creating classes.
- Faculty create class: name, subject, academic year, division, description, enrollment mode, student limit, code expiry. Get unique code like `VIT-CS26-K7P9Q`.
- Faculty can expire / revoke / rotate code; see enrolled students + pending requests.
- Student enters code → sees class details + verified faculty → confirms → joins immediately or waits for approval.
- Role-specific dashboards and navigation with real data.
- Codes: hard to guess, brute-force protected, never the only proof of identity.
- Security-sensitive actions written to an audit log.
- **Done when:** verified faculty creates a class and an eligible student joins with the code and sees it on their dashboard.

## Technology decisions (agent's call, per product brief)

| Layer | Choice | Why |
|---|---|---|
| App | Next.js 15 App Router, TypeScript strict, RSC + Server Actions | One deployable; server-side authz on every mutation |
| DB | PostgreSQL 18 (local) via Prisma | Constraints + partial unique indexes enforce the state machines |
| Auth | Auth.js v5, Google OIDC, server-side check `hd === "vit.edu"` AND `email_verified`; account keyed on Google `sub`; **database sessions** | `hd` is Google's documented domain check; DB sessions make suspend/role change instant |
| Dev sign-in | Dev identity provider, registered only when `NODE_ENV !== "production"` AND `CAMPUSIGN_DEV_AUTH=1` | Build/QA without a Google OAuth client; cannot exist in prod |
| UI | Tailwind v4 + own tokens from DESIGN.md, Radix primitives, Motion | Own identity, accessible primitives |
| Logging | pino structured logs with request id | |
| Tests | Vitest (unit + integration on test DB), Playwright (done-criteria E2E) | |

## Identity & role model (ROLE-SOURCE, revised by user)

- Any Google account with verified `hd = vit.edu` may sign in. Non-VIT accounts are rejected at the callback with a clear screen.
- **Student** is the default role for every verified VIT account. No student roster import.
- **Faculty** = an email the admin has approved. Two paths into the same table:
  1. Admin adds faculty emails directly (pre-approval; applied at that user's next sign-in or immediately if they exist).
  2. A signed-in user requests faculty access from their account → admin approval queue → approve/reject.
- Faculty not yet approved cannot create classes (guard in service layer, not just UI).
- **Admin** = bootstrapped from `ADMIN_EMAILS` env; admins can approve faculty and view the audit log.
- Role is read from the DB on every request; never trusted from the client or a cached token.

## Step 0 — Scope challenge

### 0A. Premise

Real problem: paper academic documents and signatures chase faculty around campus; no record of who approved what. Phase 1 is the trust foundation (who you are, which class you belong to). Every later phase inherits it: if role or enrollment can be spoofed, a later signature is meaningless. Plan addresses the pain directly.

Premise flags:
1. `hd` proves VIT membership only. Resolved by ROLE-SOURCE (admin-approved faculty, everyone else student).
2. Code only *locates* a class. Join also requires a verified student session, eligibility, and (in approval mode) faculty consent.

### 0B. Existing code leverage

Greenfield. Reuse ladder: Postgres constraints, `node:crypto` `randomInt`, Auth.js, Radix.

### 0C. Dream state

```
  CURRENT STATE                  THIS PLAN (Phase 1)                 12-MONTH IDEAL
  Paper forms, WhatsApp   --->   Verified VIT identity, admin- --->   Signed academic doc workflows,
  groups for class lists,        approved faculty, classes,          verifiable on a permissioned
  no audit trail                 code enrollment, audit log          chain, directory sync, mobile-first
```

### Class code design (CODE-LEN, agent)

`VIT-<SUBJ><YY>-<5 secret chars>`, e.g. `VIT-CS26-K7P9Q`. Prefix is display context only. Secret: 5 chars from a 31-char unambiguous alphabet (no 0/O/1/I/L) via `crypto.randomInt` → ~28.6M per prefix. Lookup normalizes case/whitespace/dashes. Layered protection:
- Lookup requires an authenticated, verified, non-suspended student session.
- Per-user limiter: 5 failed lookups per 15 min, then lockout doubling up to 24h; per-IP limiter 30 failures / 15 min. Stored in Postgres.
- All non-matches (unknown / expired / revoked / superseded) return one identical response.
- Failures audit-logged; lockouts audit-logged.
- Expiry, revoke, rotate take effect immediately (checked at confirm time, not only lookup time).

## Decision ledger

| ID and owner | Contract and evidence | Current | Proposed | Status | Exact approval and scope |
|---|---|---|---|---|---|
| MODE (user) | 0E | SCOPE REDUCTION | — | approved | D4 answer: "Scope reduction (recommended)" |
| ROLE-SOURCE (user) | Brief: role from verified permissions | Students = any verified `hd=vit.edu`; faculty = admin-approved email (direct add or request queue); no roster import | — | approved (reopened once) | D3 answered A; reopened by user in D5/D6 reply: "we are not importing students … approve faculty mails … .vit@edu scoped domains for google auth" |
| ELIGIBILITY (user) | Done-criteria: "eligible student" | Verified student, not suspended, not already enrolled/pending, seats left (ACTIVE count < limit), code ACTIVE & unexpired | — | approved | D5 reply (no roster → year/division are display-only) |
| ADMIN-CONSOLE (user) | Brief: audit log | Faculty approvals (queue + direct add + revoke) + read-only audit log viewer | — | approved | D6: "go with 1 but reduce the scope" (roster mgmt removed) |
| CODE-LEN (agent) | Brief example | 5 chars + layered limits | — | approved | Product brief delegates tech decisions |
| STACK (agent) | Product brief | Table above | — | approved | Product brief delegation |

Scope reduction: no brief items cut (every item is in done-criteria or a stated security requirement).

## Section 1 — Architecture

```
 Browser ──► Next.js (RSC + Server Actions) ──► requireRole() guard (DB role per request)
                │                                      │
           Auth.js (Google hd=vit.edu | dev-only)      ├─► classes.ts   ─► Postgres: classes, class_codes
                │                                      ├─► enrollment.ts (tx + SELECT … FOR UPDATE on class)
           sessions table (revocable)                  ├─► faculty.ts   (approval queue, allowlist)
                                                       ├─► rate-limit.ts (pg) ─┐
                                                       └─► audit.ts (append-only trigger) ◄┘
```

State machines (DB constraints enforce invalid transitions; service layer checks from-state in the UPDATE's WHERE clause):

```
 FacultyAccess: (none) ─request─► PENDING ─admin─► APPROVED ─admin─► REVOKED
                (none) ─admin add──────────────────► APPROVED          PENDING ─admin─► REJECTED
 ClassCode:     ACTIVE ─► EXPIRED (expiresAt passed, computed) | REVOKED | SUPERSEDED (rotate)
                partial unique index: one ACTIVE code per class; codes never reused
 Enrollment:    (none) ─join(open)─► ACTIVE           (none) ─join(approval)─► PENDING
                PENDING ─faculty─► ACTIVE | REJECTED  PENDING ─student─► WITHDRAWN
                ACTIVE ─faculty─► REMOVED             unique(classId, studentId); REJECTED/WITHDRAWN/REMOVED may re-request
```

Security boundaries per mutation:

| Mutation | Who | Guard |
|---|---|---|
| createClass | APPROVED faculty | role + FacultyAccess=APPROVED |
| expire/revoke/rotateCode, approve/reject/remove enrollment | faculty who owns class | ownership check on classId (no IDOR) |
| lookupCode / joinClass / withdraw | verified student | role + rate limit |
| approve/reject/revoke faculty, add faculty email | admin | role |

Scaling: 10x/100x of a single campus is trivial for Postgres; first to break is the pg-backed rate limiter under abuse (indexed upsert, fine to ~1k rps). SPOF: single Postgres. Rollback: redeploy previous build; migrations are additive.

Findings: none open (sessions = DB; limit counts ACTIVE only; approval blocked when full).

## Section 2 — Error & Rescue Map

```
 CODEPATH                 | WHAT CAN GO WRONG                        | ERROR CLASS
 -------------------------|------------------------------------------|------------------------
 auth signIn callback     | hd missing / not vit.edu / unverified     | AccessDenied (Auth.js)
                          | Google down / OAuth misconfig             | OAuthCallbackError
 requireRole              | no session / wrong role / suspended       | AuthzError(401|403)
 createClass              | invalid input                             | ValidationError (zod)
                          | code collision on insert                  | Prisma P2002 → retry 5x
                          | faculty not approved                      | AuthzError(403)
 lookupCode               | rate limited                              | RateLimitedError
                          | no match / expired / revoked              | CodeNotFound (uniform)
 joinClass                | class full                                | ClassFullError
                          | already enrolled/pending                  | AlreadyEnrolledError (P2002)
                          | code changed between lookup and confirm   | CodeNotFound
                          | serialization/lock timeout                | Prisma P2034 → retry 2x
 rotate/revoke/expire     | not owner                                 | AuthzError(403)
 approveEnrollment        | class full / not PENDING anymore          | ClassFullError / StaleStateError
 audit.write              | DB error                                  | propagates: same tx, action fails
```

All typed errors map to a user-facing message via one `toActionResult()`; unknown errors log with request id + actor and show "Something went wrong (ref XXXX)". No swallow-and-continue. Audit writes share the mutation's transaction: no action without its audit row. GAPS: 0.

## Section 3 — Security & Threat Model

| Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Non-VIT Google account signs in | High | High | `hd` + `email_verified` server-side; `hd` hint alone not trusted |
| Student self-escalates to faculty | Med | High | Role only from FacultyAccess table written by admin; all checks server-side |
| Code brute force | Med | Med | Auth-only lookup, per-user + per-IP limits, uniform responses, audit |
| IDOR on class/enrollment ids | Med | High | Every faculty mutation checks `class.facultyId === session.userId` |
| Dev auth enabled in prod | Low | Critical | Double gate (NODE_ENV + flag), startup assertion throws in prod if flag set, test |
| Audit tampering | Low | High | Postgres trigger rejects UPDATE/DELETE on audit_events; app DB role has no TRUNCATE |
| XSS via class description | Med | Med | React escaping, no `dangerouslySetInnerHTML`, length limits (zod) |
| CSRF on server actions | Low | Med | Next.js origin check on actions; SameSite=Lax cookies |
| Secrets | — | — | `AUTH_SECRET`, Google client id/secret, `DATABASE_URL` in env only; `.env` gitignored |

PII: name, email, Google avatar URL. No other personal data stored. Audit log stores actor id, action, target, IP, user agent, metadata JSON.

## Section 4 — Data flow & interaction edge cases

```
 join: code ─► normalize ─► rateLimit ─► find ACTIVE code ─► class preview (faculty name, verified badge, seats)
          │ empty/garbage → uniform CodeNotFound     │ limited → 429 + retry-after shown
 confirm ─► tx: lock class row ─► recheck code ACTIVE & unexpired ─► eligibility ─► insert enrollment ─► audit ─► commit
```

Async ordering: invariant "ACTIVE enrollments ≤ studentLimit". Two concurrent joins at limit-1: both lock the class row (`FOR UPDATE`); second waits, recounts, gets ClassFullError. Same mechanism guards approveEnrollment vs open join. Test with two parallel transactions.

| Interaction | Edge case | Handled |
|---|---|---|
| Join confirm | double click | button disables + unique constraint |
| Join confirm | code rotated while on preview | recheck in tx → "This code is no longer valid. Ask your faculty for the current code." |
| Rotate code | faculty double-clicks | old code already SUPERSEDED; second rotate supersedes the new one (acceptable, both audited) → button disabled while pending |
| Pending list | request withdrawn while faculty approves | `UPDATE … WHERE status='PENDING'` → StaleStateError toast + refresh |
| Dashboard | zero classes | designed empty state with primary action |
| Faculty | approved mid-session | role read per request → next navigation shows faculty nav |

## Section 5 — Code quality

Layout: `src/server/{auth,authz,classes,enrollment,faculty,audit,rate-limit,codes}.ts` (pure services, no Next imports), `src/app/(student|faculty|admin)/…` routes, `src/components/ui` primitives. One error→result mapper. No repository abstraction over Prisma. No issues.

## Section 6 — Tests

| Item | Type | Happy | Failure | Edge |
|---|---|---|---|---|
| Code generator | unit | format/alphabet | — | 10k samples no ambiguous chars |
| signIn callback | unit | vit.edu verified → ok | gmail.com, missing hd, unverified → denied | case of hd |
| requireRole | unit | faculty ok | student → 403, suspended → 403 | unapproved faculty |
| createClass | integration | creates class + ACTIVE code + audit | unapproved → 403 | collision retry (seeded RNG) |
| code mgmt | integration | rotate → old SUPERSEDED, new ACTIVE | non-owner → 403 | expire then lookup → uniform not found |
| lookup | integration | preview data | 6th failure → limited | normalization of `vit cs26 k7p9q` |
| join | integration | open → ACTIVE; approval → PENDING | full → ClassFull; duplicate → AlreadyEnrolled | concurrent last seat (2 tx) |
| enrollment approve | integration | PENDING → ACTIVE | full; withdrawn → stale | — |
| audit | integration | row per sensitive action | UPDATE/DELETE rejected by trigger | — |
| dev auth gate | unit | enabled in dev w/ flag | throws in prod w/ flag | — |
| **Done-criteria** | E2E (Playwright, dev auth) | admin approves faculty → faculty creates class → student joins with code → class on student dashboard | wrong code → error | approval-mode path |

2am test: the E2E above + concurrent last seat. No time/randomness flake: fixed clock injection for expiry, seeded RNG for codes.

## Section 7 — Performance

Indexes: `class_codes(code)` unique, partial unique `(class_id) WHERE status='ACTIVE'`, `enrollments(class_id, status)`, `enrollments(student_id)`, `audit_events(created_at desc)`, `(actor_id)`, `rate_limits(key)`. Dashboards load with one query each using `include` (no N+1). Slowest path: join confirm tx (~10ms). No caching needed.

## Section 8 — Observability

pino logs at each service entry/exit with request id, actor id, action. Audit viewer (admin) filters actor/action/date. Metrics deferred until deploy target exists. Runbook entries in README: locked-out student (admin clears via DB in Phase 1), Google OAuth misconfig.

## Section 9 — Deployment

Phase 1 runs locally (Postgres 18 local, dev auth). Migrations additive, `prisma migrate deploy` before app start. Production deploy target is undecided → TODO. Post-deploy smoke: `/api/health` (DB ping) + E2E against staging.

## Section 10 — Trajectory

Reversibility 4/5 (role model is the one stickier choice; FacultyAccess table can later be fed by Directory API). Debt: no hash-chained audit yet (Phase 3 anchoring will need it), no deploy target. Phase 2 (document submission) plugs into Enrollment ACTIVE as its authorization.

## Section 11 — Design & UX

```
 /sign-in ──Google──► (not vit.edu) ─► /denied
     │
     ├─ student ─► /dashboard (my classes, pending) ─► /join ─► code ─► preview ─► confirm ─► joined | pending
     ├─ faculty (unapproved) ─► /dashboard (request access / pending state)
     ├─ faculty (approved) ─► /dashboard (classes, pending counts) ─► /classes/new ─► class detail
     │                                                   class detail: code card (copy/rotate/revoke/expire), roster, requests
     └─ admin ─► /admin (faculty queue + approved list) ─► /admin/audit
```

State coverage required for every screen: loading (skeleton), empty, error, success, partial. Design system comes from /design-consultation → DESIGN.md; screen directions from /design-shotgun; /design-review after build. Mobile: student join flow must be phone-first (students will join from phones in class).

## NOT in scope

- Student roster import, year/division eligibility restriction — rejected by user (D5/D6 reply).
- Admin roster management UI — rejected by user (D6).
- Hash-chained audit log — deferred to Phase 3 (TODOS.md).
- Production deploy target + metrics/alerts — deferred (TODOS.md).
- Google Workspace Directory API sync — deferred (TODOS.md).

## What already exists

Nothing in repo (greenfield).

## Dream state delta

After Phase 1: verified identity, admin-gated faculty, class membership, and an audit trail exist. Remaining toward ideal: document submission + signing (Phase 2), chain anchoring (Phase 3), directory sync, deploy.

## Failure Modes Registry

```
 CODEPATH        | FAILURE MODE           | RESCUED? | TEST? | USER SEES?                 | LOGGED?
 signIn          | non-VIT account        | Y        | Y     | /denied explainer          | Y (audit)
 createClass     | code collision         | Y retry  | Y     | nothing (transparent)      | Y
 lookupCode      | brute force            | Y        | Y     | lockout w/ retry time      | Y (audit)
 joinClass       | last-seat race         | Y        | Y     | "Class is full"            | Y
 joinClass       | code rotated mid-flow  | Y        | Y     | "Code no longer valid"     | Y
 approve         | stale request          | Y        | Y     | toast + refreshed list     | Y
 audit.write     | DB failure             | Y (tx)   | Y     | generic error w/ ref       | Y
```
CRITICAL GAPS: 0.

## Implementation Tasks

- [ ] **T1 (P1, human: ~4h / CC: ~10min)** — scaffold — Next.js 15 + TS + Tailwind v4 + Prisma + Vitest + Playwright; Verify: `pnpm build && pnpm test`
- [ ] **T2 (P1, human: ~6h / CC: ~20min)** — schema — users, sessions, accounts, faculty_access, classes, class_codes, enrollments, audit_events (+trigger), rate_limits; Verify: migrate on fresh DB, trigger test
- [ ] **T3 (P1, human: ~1d / CC: ~30min)** — auth — Auth.js Google hd=vit.edu + dev provider gate + requireRole; Verify: unit tests Section 6
- [ ] **T4 (P1, human: ~1d / CC: ~30min)** — services — classes/codes/enrollment/faculty/audit/rate-limit; Verify: integration tests incl. concurrent last seat
- [ ] **T5 (P1, human: ~3d / CC: ~1.5h)** — UI — student/faculty/admin dashboards, join flow, class detail, admin queue + audit viewer per DESIGN.md; Verify: /design-review
- [ ] **T6 (P1, human: ~4h / CC: ~15min)** — E2E — done-criteria Playwright spec; Verify: `pnpm e2e` green

Approval readiness: PASS — MODE (D4), ROLE-SOURCE (D3 + user revision in D5/D6 reply), ELIGIBILITY (D5 reply), ADMIN-CONSOLE (D6 reply), CODE-LEN/STACK (product brief delegation), TODOs (D7, D8, D9 → TODOS.md).

## Completion Summary

```
  +====================================================================+
  |            MEGA PLAN REVIEW — COMPLETION SUMMARY                   |
  +====================================================================+
  | Mode selected        | SCOPE REDUCTION                             |
  | System Audit         | Greenfield repo, no commits, no TODOs       |
  | Step 0               | Reduction; role model revised by user       |
  | Section 1  (Arch)    | 2 issues found (role source, eligibility)   |
  | Section 2  (Errors)  | 14 error paths mapped, 0 GAPS               |
  | Section 3  (Security)| 9 threats, 3 High impact, all mitigated     |
  | Section 4  (Data/UX) | 6 edge cases mapped, 0 unhandled            |
  | Section 5  (Quality) | 0 issues found                              |
  | Section 6  (Tests)   | Diagram produced, 0 gaps                    |
  | Section 7  (Perf)    | 0 issues found                              |
  | Section 8  (Observ)  | 1 gap (metrics) → TODO                      |
  | Section 9  (Deploy)  | 1 risk flagged (no deploy target) → TODO    |
  | Section 10 (Future)  | Reversibility: 4/5, debt items: 2           |
  | Section 11 (Design)  | 0 issues; UI scope → design skills next     |
  +--------------------------------------------------------------------+
  | NOT in scope         | written (5 items)                           |
  | What already exists  | written                                     |
  | Dream state delta    | written                                     |
  | Error/rescue registry| 14 rows, 0 CRITICAL GAPS                    |
  | Failure modes        | 7 total, 0 CRITICAL GAPS                    |
  | TODOS.md updates     | 3 items proposed, 3 added                   |
  | Scope proposals      | 0 proposed, 0 accepted (reduction mode)     |
  | CEO plan             | skipped by mode                             |
  | Outside voice        | codex: unavailable (401, needs codex login) |
  | Lake Score           | 1/2 recommendations chose complete option   |
  | Diagrams produced    | 5 (architecture, state, data flow, errors, user flow) |
  | Stale diagrams found | 0                                           |
  | Unresolved decisions | 0                                           |
  +====================================================================+
```

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: SCOPE_REDUCTION, 0 critical gaps |
| Outside Review | codex (auto, plan-review) | Independent 2nd opinion | 1 | unavailable | 401 auth failure; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex, plan-review phase, unavailable (401 Unauthorized, run `codex login`); native fallback unavailable (no TaskOutput tool). No completed external review.
- **VERDICT:** CEO CLEARED — eng review required.

NO UNRESOLVED DECISIONS

## Post-review user changes (2026-10-09)

- **Students are always auto-approved on join.** No enrollment mode, no pending requests, no approve/reject. Enrollment states: ACTIVE, REMOVED (faculty), LEFT (student). Supersedes the brief's "or wait for faculty approval" and the approval rows above.
- Product is general **academic document signing** (no EDIF-specific flows).
- UI direction (design-shotgun): faculty home = class ledger (variant A); student home = join-field first (variant B); create class = single page + live code certificate preview (variant A).

## Eng review (single pass, 2026-10-09)

Scope record: feature answers: no cuts proposed; structure: Smaller arrangement (D1); accepted scope: brief + post-review user changes; pending remedies: none.

Decision ledger:
- **R1 auth library** — [P1] (8/10) Auth.js Credentials cannot create DB sessions. Approved (D2): **Better Auth** + Prisma adapter, Google `hd=vit.edu` + `email_verified` server-side, DB sessions, dev sign-in via server-only route gated by `NODE_ENV!=='production' && CAMPUSIGN_DEV_AUTH==='1'`.
- **Structure** — Approved (D1): `src/server/{auth,classes,enrollment,faculty,audit,rate-limit}.ts`.

Section findings: Architecture — enrollment simplified to ACTIVE/REMOVED/LEFT (auto-approve); limit still enforced under `SELECT … FOR UPDATE`. Code quality — no issues found. Tests — Vitest integration on docker Postgres (`campusign_test` db) + Playwright E2E for done-criteria; approval-path tests replaced by auto-join tests. Performance — no issues found.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | CLEAR | mode: SCOPE_REDUCTION, 0 critical gaps |
| Outside Review | codex (auto, plan-review) | Independent 2nd opinion | 2 | unavailable | 401 auth failure; no completed external review |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 1 issue, 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | design-consultation + design-shotgun completed instead |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE COVERAGE:** codex unavailable (401, run `codex login`); no completed external review.
- **VERDICT:** CEO + ENG CLEARED — ready to implement.

NO UNRESOLVED DECISIONS
