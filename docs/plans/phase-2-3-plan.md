# CampusSign Phases 2 + 3: document review, signing, and verification

Plan date: 2026-10-09. Builds on Phase 1 (identity, roles, classes, enrollment, audit log). This plan got a quick review only, as requested; the risks and decisions it found are listed at the end.

## Done criteria

- **Phase 2:** a student submits a PDF. The faculty member reviews that exact version and records a decision, and the document keeps its full version history.
- **Phase 3:** a signed PDF verifies successfully, and changing any single byte makes verification fail.

## Data model (additions)

```
DocumentType   id, code (unique), name, active                 seeded: ASSIGNMENT, LAB_REPORT, PROJECT_REPORT,
                                                               INTERNSHIP_REPORT, LEAVE_APPLICATION, BONAFIDE_REQUEST,
                                                               NO_DUES, OTHER
Document       id, classId, studentId, typeId, title, status, currentVersionId, createdAt, updatedAt
DocumentVersion id, documentId, number, storageKey, sha256, sizeBytes, pageCount,
               originalName, uploadedById, createdAt, submittedAt (non-null ⇒ locked)
               unique(documentId, number)
DocumentEvent  id, documentId, versionId?, actorId, type, reason?, createdAt          (history timeline)
SigningCredential id, facultyId, keyId (unique, sha256(pubkey)[0..16]), publicKeyPem,
               encryptedPrivateKey (AES-256-GCM, KEK from env), status ACTIVE|ROTATED|REVOKED,
               createdAt, retiredAt?, revokedReason?
               partial unique: one ACTIVE per faculty
Signature      id, code (public verification id), documentId, versionId, credentialId,
               decision, payload (canonical JSON), signature (base64 Ed25519),
               originalSha256, signedSha256 (unique), signedStorageKey, signedAt
```

## Document state machine

```
            upload v1                 submit (locks version)
  (none) ───────────► DRAFT ─────────────────────────► SUBMITTED
                       ▲  new version (draft vN)            │ faculty opens review
                       │                                    ▼
          CORRECTIONS_REQUESTED ◄── request corrections ── PENDING_REVIEW ── reject (reason) ──► REJECTED
                       │                                    │
                       └── upload vN+1 → DRAFT              └── approve & sign ──► APPROVED (+ Signature)
```

Rules:
- **New versions:** a new version can only be uploaded in DRAFT or CORRECTIONS_REQUESTED. A submitted version is never replaced.
- **Decisions:** a decision names the `versionId` it was made on. The server rejects it as stale unless that is still the current version and the document is SUBMITTED or PENDING_REVIEW.
- **Reasons:** "reject" and "request corrections" both require a reason (10–1000 characters).
- **Events:** every transition writes a DocumentEvent and an audit row in the same transaction.

## Access

| Actor | Can |
|---|---|
| Student (owner) | Create a document in a class where they hold an ACTIVE enrollment. View their own documents and files, upload versions, submit, and download the signed PDF. |
| Faculty (class owner, APPROVED) | Read the inbox and the review workspace for their classes only. Decide and sign. |
| Everyone else, including admins and other faculty | NOT_FOUND. No existence leak. |
| Public (no login) | `/verify`: look up by SHA-256 hash or verification code. The result shows document type, class name, signer name, signed time, and hashes. It never shows the student's name or email, or the document title. |

## Storage

- **Location:** files live in a private local directory (`STORAGE_DIR`, default `./storage`, gitignored). Keys are random 32-hex `.pdf` names, enforced by a regex that also blocks path traversal. Files are written with `wx` at mode 0600.
- **Serving:** only `GET /api/files/[versionId]` (the submitted version) and `GET /api/files/signed/[signatureId]` serve files. Both re-check access on every request and send `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and `Content-Disposition` set to inline or attachment.
- **Upload:** a route handler (`POST /api/documents`, `POST /api/documents/[id]/versions`) takes up to 10 MB of `multipart/form-data`. The file must start with the `%PDF-` magic bytes and parse with pdf-lib, and the server computes the SHA-256 itself; client-supplied hashes are never trusted.

## Signing (Phase 3)

- **Algorithm:** Ed25519 from `node:crypto`.
- **Private keys:** encrypted with AES-256-GCM under `SIGNING_KEK` (32 bytes, base64, from env), using a random IV per key; the AAD is the credential id. Private keys are decrypted only inside `approveAndSign` and never returned or logged.
- **Credential lifecycle:** create, rotate (the old key becomes ROTATED and its earlier signatures stay valid), and revoke (signatures made with it then FAIL verification as revoked). Revoking a faculty member's access also revokes their credentials.
- **Approve & sign** is one action with these steps:
  1. Explicit confirmation: the form sends `confirm=on` plus the version hash the faculty member saw (`expectedSha256`). The server requires it to equal the current version's hash.
  2. In one transaction, it locks the document row and runs a fresh authorization check: faculty access APPROVED, faculty owns the class, document type active, an active credential exists, the status allows a decision, and the version is current.
  3. It builds the stamped PDF: the original pages plus an appended certificate page (seal, signer, class, type, version, original hash, verification code and URL). This page is cosmetic.
  4. It computes `signedSha256` and the payload `{v:1, signatureId, code, documentId, versionId, versionNumber, documentType, classId, decision:"APPROVED", originalSha256, signedSha256, signerKeyId, signedAt}` in canonical JSON (sorted keys), then signs it with Ed25519.
  5. It stores the signed PDF, the Signature, the APPROVED status, the DocumentEvent SIGNED, and the audit row.
- **Verification:** compute SHA-256, then look up the Signature by `signedSha256`. A miss is "unknown or modified document". On a hit it:
  - checks the signature against the stored public key;
  - recomputes the payload's hash fields and compares them to the stored hashes;
  - checks the credential status (REVOKED fails).
  Results are `VALID | MODIFIED_OR_UNKNOWN | REVOKED | INVALID_SIGNATURE`. The browser hashes the file locally with WebCrypto, so the PDF never leaves the device. A server-side `verifyBytes` exists for tests and APIs.

## Screens

The UI follows DESIGN.md: ledger tables, mono for hashes and IDs, and the guilloché only on proof surfaces (the signed certificate and the verify result).

- **Student:** `/documents` lists documents with status. `/documents/new` takes class, type, title, and file. `/documents/[id]` shows the preview iframe, submit or upload-new-version, versions with hashes, history timeline, and the signed PDF download.
- **Faculty:** `/inbox` filters by status, class, and type and sorts by submitted date, class, or status. `/review/[id]` shows the exact-version PDF, a context panel, history, and decide (approve & sign / request corrections / reject). `/signing` manages the credential.
- **Public:** `/verify` takes a dropped PDF and hashes it in the browser. `/verify/[code]` shows the certificate.

## Quick review (findings → decisions)

1. **A version could change during review (P1).** Decisions carry the `versionId` and `expectedSha256`, and the server rejects a decision whose version is no longer current. Uploading is blocked while SUBMITTED or PENDING_REVIEW.
2. **Signed-PDF hash vs. signature ordering (P1).** The stamp page doesn't contain the signature bytes, so `signedSha256` can be computed before signing and included in the signed payload. Changing one byte means the hash lookup misses, so verification fails.
3. **Key exposure (P1).** The KEK is from env only, and the app refuses to sign without it. Keys use AES-GCM with the credential id as AAD, so ciphertexts can't be swapped between rows. There is no API that returns key material.
4. **Verification privacy (P1).** Public results contain no student identity; tests assert that the student's name and email are absent.
5. **Upload abuse (P2).** Uploads are capped at 10 MB, checked for magic bytes, and required to parse. Only enrolled students can upload. A per-user upload rate limit is deferred to TODOS.
6. **Server Action body limit (P2).** Uploads use route handlers instead of Server Actions to avoid the 1 MB default.
7. **Storage durability (P3).** Local disk only for now; an S3-compatible adapter behind the same interface is deferred to TODOS along with the deploy target.

## Tests

- **Integration (Vitest):**
  - upload validation (non-PDF, empty, too large)
  - server-computed hash
  - submit locks the version
  - versioning only allowed in DRAFT or CORRECTIONS
  - access isolation: another student, another faculty member, and the admin all get NOT_FOUND
  - stale decisions are rejected
  - corrections → v2 → resubmit → approve, with the full history
  - reject requires a reason
  - credentials are encrypted at rest
  - signing requires confirmation and a matching hash
  - another class's faculty can't sign
  - a signed PDF verifies, and a flipped byte fails
  - a revoked credential fails
  - an unknown document fails
  - the verification result leaks no PII
- **E2E (Playwright):** the student uploads and submits a PDF. The faculty member opens it in the inbox and approves & signs. The student downloads the signed PDF. The public verify page passes it, and fails a modified copy.
