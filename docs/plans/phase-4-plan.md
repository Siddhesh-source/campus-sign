# CampusSign Phase 4: blockchain trust layer

Plan date: 2026-10-09. This plan got a quick review only; its findings are at the end.

**Done when:** approval events are recorded on the ledger and verifiable there, and an interrupted submission recovers cleanly.

## Choice

**Hyperledger Fabric 2.5**, running locally on the fabric-samples **test network**: 2 peer orgs and 1 Raft orderer, with a channel named `campussign`.
- **Why Fabric:** it's permissioned, and every participant is a known MSP identity, so it fits a university (VIT IT, departments, an external auditor org later).
- **Chaincode:** TypeScript, deployed as **Chaincode-as-a-Service**, so no docker-in-docker is needed on Windows.
- **App connection:** the app talks to the peer through `@hyperledger/fabric-gateway` (gRPC + TLS) using the Org1 user identity.

The ledger is a **verification layer**. Postgres stays the system of record, and the app keeps working when the ledger is down; events just queue up.

## What goes on-chain (allow-list, enforced in two places)

```
LedgerEvent (on-chain JSON, canonical, key = eventId)
  eventId        uuid   (idempotency key, generated in the app DB transaction)
  type           SUBMITTED | APPROVED | REJECTED | CORRECTIONS_REQUESTED | KEY_REVOKED
  documentRef    opaque document id (cuid; no personal data)
  versionId, versionNumber
  sha256         hash of the submitted version
  signedSha256   (APPROVED only)
  signerKeyId    (APPROVED, KEY_REVOKED)
  occurredAt     app timestamp (ISO)
  + chaincode-added: txId, txTimestamp, submitterMsp
```

**Never on-chain:** student names, PRNs, emails, document titles, PDF bytes, private keys, or rejection/correction comments.
- **App side:** `toLedgerPayload()` builds events from a fixed allow-list.
- **Chaincode side:** `validateEvent()` rejects any key that isn't on the list, and any value that looks like an email.
- **Tests:** both sides are tested.

## Exactly-once-ish delivery (outbox + idempotent chaincode)

```
 business tx (Postgres) ──► ledger_outbox row (PENDING, eventId, payload)   same DB transaction
                                     │
            relay (in-process kick + `pnpm ledger:relay` worker, FOR UPDATE SKIP LOCKED)
                                     ▼
            Fabric submit RecordEvent(payload) ──► chaincode:
                key exists & identical  → return stored (idempotent replay, no new event)
                key exists & different  → CONFLICT (mismatch, flagged)
                new                     → putState + composite index (doc, hash)
                                     ▼
            commit status VALID ──► outbox CONFIRMED (txId, blockNumber, confirmedAt)
            error ──► attempts++, nextAttemptAt = backoff (5s · 2^n, max 10 min), lastError
```

Crash windows, all covered by tests:
1. **Crash before submit:** the row stays PENDING, and the next relay run submits it.
2. **Crash after the ledger commit but before the DB update:** the next run resubmits, the chaincode sees an identical payload and returns the stored record, and the row becomes CONFIRMED. There's no duplicate, because the key is the eventId.
3. **Two relays running at once:** `SKIP LOCKED` stops both from claiming the same row. Even if both submit, the chaincode's idempotency keeps a single event on-chain.

**Reconciler** (`pnpm ledger:reconcile`, plus an admin page): for every CONFIRMED row it reads the chain and compares the canonical payload. It flags `MISSING_ON_CHAIN`, `PAYLOAD_MISMATCH`, or (scanning the chain) `UNKNOWN_ON_CHAIN`. Mismatches are stored in `ledger_mismatch` and shown to admins. They are never auto-fixed.

## UI: decision vs. confirmation

Every document shows two separate lines:
- **Faculty decision:** Approved & signed / Rejected / … (from Postgres)
- **Blockchain record:** Queued / Confirmed in block #N (tx `abcd…`) / Retrying (attempt 3) / Mismatch

The **"Fully verified"** state, with the seal, appears only when all three hold: the Ed25519 signature is VALID, the ledger event is CONFIRMED, and the on-chain record matches.

## Verification (public)

`verifyHash` now also reads the chain live (gateway `evaluate`), looking up the event by `signedSha256`.

| Signature | Ledger | Result shown |
|---|---|---|
| VALID | confirmed + match | **Fully verified** |
| VALID | pending (outbox not confirmed) | Signature valid, **awaiting blockchain confirmation** |
| VALID | unreachable | Signature valid, **blockchain unavailable**, not fully verified |
| VALID | mismatch / missing | **Ledger mismatch**, untrusted |
| REVOKED / INVALID / unknown | n/a | same as Phase 3 |

A KEY_REVOKED event on-chain also counts as revocation.

## Config

```
LEDGER_MODE=fabric|off
FABRIC_PEER_ENDPOINT=localhost:7051
FABRIC_PEER_HOST_ALIAS=peer0.org1.example.com
FABRIC_MSP_ID=Org1MSP
FABRIC_CRYPTO_PATH=.fabric/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com
FABRIC_CHANNEL=campussign
FABRIC_CHAINCODE=campussign
```

With `LEDGER_MODE=off`, events still queue in the outbox but are never sent, and the UI says the blockchain record is unavailable.

## Scripts

- `pnpm ledger:up`: start the test network, create the channel, and deploy the chaincode via CCAAS.
- `pnpm ledger:down`: stop the test network.
- `pnpm ledger:relay`: run the relay worker.
- `pnpm ledger:reconcile`: run the reconciler.

## Quick review: findings and decisions

1. **Dual-write inconsistency (P1):** solved by the outbox in the same transaction as the business event, plus idempotent chaincode keyed by eventId.
2. **Personal data leaking to an immutable ledger (P1):** the allow-list is enforced in both the app and the chaincode, and tests assert that forbidden fields are rejected.
3. **Showing "verified" before confirmation (P1):** the UI uses separate states, and "fully verified" requires all three checks.
4. **Ledger outage blocking faculty work (P2):** decisions never wait on the chain, and the outbox absorbs outages.
5. **Testing the crash windows (P2):** the chaincode logic lives in a pure `ledger-core` module, used by both the real chaincode and an in-memory test ledger with failure injection. A real-Fabric integration test runs when the network is up (`LEDGER_IT=1`).
6. **Windows + Fabric tooling (P3):** CCAAS avoids docker-in-docker. If the test network can't run on this machine, `LEDGER_MODE=off` still passes every non-ledger test.

## Tests

- **Unit:** the allow-list, chaincode-core validation, idempotency, and conflict detection.
- **Integration, in-memory ledger:**
  - outbox rows are created atomically with decisions
  - relay crash before and after submit leaves no duplicates
  - concurrent relays
  - backoff
  - reconciler detects missing, mismatched, and unknown events
  - verification states
- **Real Fabric** (`LEDGER_IT=1`): approval recorded and readable on-chain, a replay is idempotent, and an interrupted relay recovers.
- **E2E:** approve → "awaiting confirmation" → relay → "Fully verified" on `/verify`.
