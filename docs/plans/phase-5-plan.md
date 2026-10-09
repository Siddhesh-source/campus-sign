# CampusSign Phase 5: secure, auditable, and pilot-ready

Plan date: 2026-10-09. This plan got a quick review only; its findings are at the end.

**Done when:** every MVP flow passes automated tests, and the app can be set up from clear documentation.

## 1. Access control: review and proof

Every route, action, and service is listed in an **authorization matrix**, and `tests/authz.test.ts` checks it actor by actor:

| Actor | Can |
|---|---|
| Anonymous | Sign in, and `/verify` (hash or code). Nothing else. |
| Student (owner) | Their own documents and files, joining classes, and their own submissions. |
| Other student | Nothing of another student's (NOT_FOUND). |
| Class faculty | Their classes' documents. Decides only at steps where they're the approver. |
| Designated approver | Only documents that reached their step. Decides only at that step. |
| Other faculty | NOT_FOUND on everything outside their classes and route steps. |
| Admin | Faculty access, document types and routes, credentials, audit, and ledger. **No** access to document contents. |

"Sign on behalf of faculty" is covered by:
- **Signing rights:** only the current step's approver can sign, using **their own** ACTIVE key. Students, admins, other faculty, revoked faculty, and holders of rotated or revoked keys are all refused, with a fresh re-check at signing time.
- **Key isolation:** credential operations are owner-only, except admin revoke. No API returns key material, and the encrypted key is bound to its row.

Hardening, added in this phase:
- **Security headers:** CSP `frame-ancestors 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, plus `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `X-Content-Type-Options`, and HSTS in production.
- **Verify rate limit:** the public verify lookup is limited per IP (60/min), so the ledger can't be hammered through it.
- **Download auditing:** signed-PDF downloads are audit-logged.

## 2. Approval routes (configurable per document type)

```
DocumentType ──< ApprovalStep(order, label, kind: CLASS_FACULTY | DESIGNATED, approverEmail?)
                 no steps ⇒ default single step: class faculty
```

- **Snapshot at submit:** a document stores its route as `routeSnapshot` (JSON) when submitted, so later edits to the route don't change documents already in flight. `currentStep` tracks progress, and `approverEmails[]` holds the designated approvers reached so far (this drives access and the inbox).
- **Step decisions:** at step *k*, approve & sign is allowed only for the current approver. If *k* < N, the document moves to the next step (status SUBMITTED, waiting for the next approver). If *k* = N, it becomes APPROVED.
- **Rejections:** reject or request-corrections at any step sends the document back to the student. A resubmitted version restarts at step 1.
- **Chained signatures:** step *k* stamps the PDF signed at step *k−1*, adding its own certificate page. The payload (v2) adds `stepOrder`, `totalSteps`, and `previousSignedSha256`.
- **Verification:**
  - Every signature in the chain must verify, and every step's ledger event must be confirmed.
  - "Fully verified" requires the final step.
  - An intermediate file shows "Approved at step k of N, awaiting <label>".
- **Ledger:** APPROVED events gain `stepOrder` and `totalSteps`. The chaincode allow-list is updated and redeployed.

## 3. Admin tools

- **Faculty:** verification (existing) plus a credential column, with revoke for each key and revoke-all.
- **Document types** (`/admin/document-types`): add, rename, activate/deactivate, and edit the approval route (steps, labels, approver). Designated approvers must be verified faculty.
- **Signing keys** (`/admin/credentials`): every key with its status and signature count, revoke with a reason, and "affected documents" for compromise handling.
- **Audit investigation:** filters for actor, action, target, and date range, an event detail view, and CSV export.

## 4. Faculty activity trail

`/activity` shows a faculty member their own audited actions: classes, codes, decisions, signatures, and key events, with filters. Students get the same page, scoped to themselves.

## 5. Operations

- **Backup and restore:** `scripts/ops/backup.sh` (pg_dump plus storage tarball and a manifest with SHA-256s) and `scripts/ops/restore.sh`, tested with a restore drill.
- **KEK rotation:** `pnpm ops:rotate-kek` re-encrypts every private key under a new KEK in one transaction, verifying each key by signing a probe first. It's covered by a test.
- **Key compromise:** `pnpm ops:affected <keyId>` lists the documents a key signed.
- **Runbooks:** `docs/operations/runbook.md` covers backups, restores, KEK rotation, faculty key compromise, faculty departure, ledger outage, mismatches, and incident reporting.

## 6. Accessibility and mobile

- **Automated a11y:** `@axe-core/playwright` scans every page (signed out, student, faculty, admin) at desktop and phone sizes. It fails on serious or critical violations.
- **No horizontal overflow:** a check runs on every page at 360px.
- **Shell fixes:** a skip link, focus outlines, labelled landmarks, `aria-live` status messages, 44px touch targets, and reduced motion.

## 7. Quality pass

Screenshot every screen and state (empty, loading, error, long content) at desktop and phone sizes, and fix anything inconsistent with DESIGN.md.

## 8. End-to-end

`e2e/full-journey.spec.ts` covers the whole pilot flow:
- admin configures a two-step route (class faculty → HoD) and verifies the faculty
- faculty creates a class and a student joins
- the student submits, the faculty member signs step 1, and `/verify` shows the partial state
- the HoD signs step 2 and the student downloads
- `/verify` reports **Fully verified**, a tampered copy fails, and a revoked key fails
- a11y checks run throughout

## 9. Documentation

- `docs/SETUP.md`: from zero to running (prerequisites, env, database, Fabric, seed, tests).
- `pnpm db:seed`: pilot demo data.
- `docs/operations/runbook.md`
- `docs/legal/open-questions.md`: India's DPDP Act and Rules, the IT Act's e-signature rules, BSA 2023 evidence, CERT-In, and records retention. These are framed as questions for counsel, not answers.

## Quick review (findings → decisions)

1. **Route edits affecting documents in flight (P1):** snapshot the route at submit time.
2. **Who decides at a step (P1):** a single `isCurrentApprover` check, used by both decide and sign and re-checked inside the locked transaction.
3. **Intermediate files presented as final (P1):** `fullyVerified` requires the final step plus every signature valid and every ledger event confirmed.
4. **KEK rotation could brick keys (P1):** one transaction that re-encrypts and then test-signs every key before commit, and rolls back on any failure.
5. **Admins seeing documents (P2):** stays forbidden; admins see metadata only.
6. **CSP vs. Next inline scripts (P3):** no `script-src` nonce work for the pilot. The framing and object restrictions are added now, and a strict CSP goes on the TODO list.
