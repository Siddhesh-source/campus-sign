# CampusSign operations runbook

These are pilot procedures. Commands assume the repo root. Every operation listed here is written to the audit log, either by the app or (for CLI ops) as `ops@cli`.

## What holds state

| Store | Contents | Source of truth? | Backup |
|---|---|---|---|
| Postgres | Users, classes, documents, versions, signatures, encrypted signing keys, audit log, ledger outbox | **Yes** | `pnpm ops:backup` |
| `STORAGE_DIR` | Submitted PDFs and signed PDFs (private) | **Yes** | `pnpm ops:backup` (same archive) |
| Secret manager | `BETTER_AUTH_SECRET`, `SIGNING_KEK`, Google OAuth client | **Yes** | Your secret manager's own backup. **Never** store these in the backup archive. |
| Hyperledger Fabric | On-chain copy of document events (no personal data) | No (it's a verification layer) | Peer and orderer volumes. The ledger is replicated across peers. |

## Backups

```bash
DATABASE_URL=... STORAGE_DIR=... pnpm ops:backup /secure/backups
```

Each backup writes `db.dump`, `storage.tgz`, `SHA256SUMS`, and `manifest.txt`. Schedule:
- **Daily:** run a backup.
- **Weekly:** copy the backup off-site.
- **Retention:** keep at least 35 days. Check the legal open questions for academic-record retention.
- **Monthly:** run a restore drill.

Signing keys inside `db.dump` are encrypted under the `SIGNING_KEK` that was active at backup time. Record which KEK version each backup needs, and keep retired KEKs, still locked away, for as long as backups made under them exist.

## Restore (and the monthly drill)

```bash
# 1. Drill into a scratch database, never production:
createdb campusign_drill
DATABASE_URL=postgres://.../campusign_drill STORAGE_DIR=/tmp/drill pnpm ops:restore /secure/backups/campussign-<stamp> --yes
# 2. Compare counts (documents, signatures, audit_event) and the storage file hashes with the source.
# 3. Drop the drill database.
```

To recover production:
1. Stop the app and the relay.
2. Run restore against the production `DATABASE_URL` and `STORAGE_DIR`.
3. Run `pnpm prisma migrate deploy`.
4. Start the app.
5. Run `pnpm ledger:relay --once`, then `pnpm ledger:reconcile`.

Events that were already on-chain will replay idempotently. Anything recorded on-chain *after* the backup shows up as `UNKNOWN_ON_CHAIN` in Admin › Blockchain. Investigate those before you resolve them, because each one is a decision the restore rolled back.

## Signing-key rotation (routine)

Faculty rotate their own keys at **Signing key → Rotate key**. Old signatures keep verifying, because rotated keys remain trusted for signatures they already made. Recommend rotating once per academic year.

## Faculty key compromise (laptop lost, account hijack, misuse)

1. **Contain (minutes):**
   - Go to Admin › Signing keys, find the key, and click **Revoke**, giving the reason.
   - If the account itself is compromised, also go to Admin › Faculty access and click **Revoke**. That revokes every key the person holds and drops their faculty rights on their next request.
   - Revocations are queued to the blockchain as `KEY_REVOKED`.
2. **Assess:**
   - Run `pnpm ops:affected <keyId>`, or click the signature count on Admin › Signing keys. This lists every document the key signed.
   - Check Admin › Audit log for `document.approve_sign` events by that actor in the suspect window, and for unusual IPs.
3. **Remediate:**
   - All of those signatures now fail public verification, which is intended.
   - For each affected document that should stand, the class faculty, using a **new** key, has the student resubmit (or the faculty requests corrections) and signs again.
   - Tell affected students that their earlier signed PDFs no longer verify and that replacements are coming.
4. **Record:** write up the incident: timeline, keys, documents, and notifications. See the incident-reporting question in `docs/legal/open-questions.md`.

## KEK rotation (key-encryption key)

Rotate yearly, or immediately if the KEK may have leaked.

```bash
SIGNING_KEK_NEW=$(openssl rand -base64 32)          # store in the secret manager first
SIGNING_KEK=<current> SIGNING_KEK_NEW=<new> pnpm ops:rotate-kek
# then set SIGNING_KEK=<new> in the app's environment and restart
```

The rotation runs in a single transaction. Every key is re-encrypted, test-signed, and verified before commit, and any failure leaves everything unchanged. Keep the old KEK sealed until no retained backup needs it.

## Faculty departure

Go to Admin › Faculty access and **Revoke** the person. Their keys are revoked with them, which means their past signatures will **fail** verification. If past signatures should keep verifying after an orderly departure, have them **rotate** first. Rotated keys stay trusted for signatures they already made. Then revoke their faculty access only after confirming this is what the institution's policy wants. This is an open policy question; see the legal doc.

Their classes remain. Reassign classes and in-flight documents before they leave; until then, those documents wait at their step.

## Ledger outage

- **What users see:** the app keeps working. Decisions are recorded, and Admin › Blockchain shows pending events with their retry attempts. `/verify` reports "Signature valid · blockchain unreachable" or "awaiting confirmation", never "Fully verified".
- **Fix:** restart the network (`pnpm ledger:up` recreates the dev network; in production, restart the failed peers/orderers), then click **Deliver pending now** or run `pnpm ledger:relay --once`.
- **Afterwards:** run `pnpm ledger:reconcile`.

## Ledger mismatch

Admin › Blockchain lists open mismatches. **Never auto-fix.** Investigate each kind as follows:

| Kind | Meaning | Look at |
|---|---|---|
| `MISSING_ON_CHAIN` | We think it's confirmed but the chain doesn't have it | Was the network reset? Was a restore made from a newer backup? |
| `PAYLOAD_MISMATCH` | The chain differs from our record | A database edit outside the app, or chain tampering. Treat as an incident. |
| `UNKNOWN_ON_CHAIN` | The chain has an event we don't | A restore from an older backup, or a smoke test written to the app's namespace. |
| `CONFLICT_ON_SUBMIT` | The same event id was used with a different payload | Treat as an incident. |

## Account lockouts

A student locked out of code lookups after too many wrong codes unlocks automatically after the lock period. To clear it early, run `DELETE FROM code_lookup_limit WHERE key = 'user:<userId>';`.

## Monitoring checklist (pilot)

- Admin › Blockchain: pending count and oldest pending age, with an alert if the oldest is over 15 minutes.
- Admin › Blockchain: the open mismatch count, with an alert if it's above 0.
- Admin › Audit log: filter for `auth.denied`, `code.lookup.locked`, and `credential.revoke` weekly.
- Disk usage of `STORAGE_DIR`, and backup job success.
