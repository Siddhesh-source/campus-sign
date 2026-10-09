# TODOS

## P1 — Production deploy target + metrics/alerts
- **What:** Choose hosting (e.g. Vercel + managed Postgres, or VIT on-prem), create the Google OAuth client restricted to `vit.edu`, add health checks, metrics and alerts.
- **Why:** Phase 1 runs locally with dev sign-in; real users need a deployed instance.
- **Pros:** Unblocks real usage. **Cons:** Hosting cost/decision needed.
- **Context:** `/api/health` exists; migrations run via `prisma migrate deploy`. Dev auth must stay disabled in prod (startup assertion enforces it).
- **Effort:** human M / CC S. **Depends on:** Phase 1 complete.

## P2 — Hash-chained audit log
- **What:** Each `audit_events` row stores `hash(prev_hash || canonical(row))`; Phase 3 anchors chain heads on the permissioned blockchain.
- **Why:** DB trigger blocks app-level edits but not a DB superuser; a chain makes tampering detectable.
- **Pros:** Phase 3 prerequisite, cheap before history accumulates. **Cons:** Serialized inserts (fine at campus scale).
- **Context:** Audit writes already happen inside the mutation transaction (`src/server/audit.ts`).
- **Effort:** human S / CC S. **Depends on:** Phase 1 audit table.

## P3 — Google Workspace Directory API sync for faculty
- **What:** Auto-approve faculty from VIT Workspace OU/group membership into `faculty_access`.
- **Why:** Removes manual admin approval each semester.
- **Pros:** Authoritative, auto-deprovisioning. **Cons:** Needs VIT IT super-admin to grant domain-wide delegation.
- **Effort:** human M / CC S. **Blocked by:** VIT IT consent.
