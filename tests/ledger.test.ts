import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { canonical, decideRecord, validateEvent } from "@ledger-core";
import { db } from "@/server/db";
import { setLedgerForTests } from "@/server/ledger/client";
import { toLedgerPayload } from "@/server/ledger/outbox";
import { LEASE_MS, relayDue, relayOne, SimulatedCrash } from "@/server/ledger/relay";
import { reconcile } from "@/server/ledger/reconcile";
import { createClass } from "@/server/classes";
import { joinClass } from "@/server/enrollment";
import { createDocument, decideDocument, startReview, submitDocument } from "@/server/documents";
import { approveAndSign, createCredential, revokeCredential, verifyBytes } from "@/server/signing";
import { getFile } from "@/server/storage";
import { LAB_REPORT, makePdf, makeUser, meta, validClass } from "./helpers";
import { MemoryLedger } from "./memory-ledger";

let ledger: MemoryLedger;
beforeEach(() => {
  ledger = new MemoryLedger();
  setLedgerForTests(ledger);
});
afterEach(() => setLedgerForTests(undefined));

async function signedDoc() {
  const fac = await makeUser("FACULTY", "Ananya Kulkarni");
  const student = await makeUser("STUDENT", "Aarav Sharma");
  const { classId, code } = await createClass(fac, validClass, meta());
  await joinClass(student, code, meta());
  const d = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Lab 3" }, { bytes: await makePdf(), name: "lab.pdf" }, meta());
  await submitDocument(student, d.documentId, d.versionId, meta());
  await startReview(fac, d.documentId, meta());
  await createCredential(fac, meta());
  const sig = await approveAndSign(fac, d.documentId, { versionId: d.versionId, expectedSha256: d.sha256, confirm: true }, meta());
  const row = await db.signature.findUniqueOrThrow({ where: { id: sig.signatureId } });
  return { fac, student, ...d, sig, pdf: await getFile(row.signedStorageKey) };
}

describe("on-chain payload rules", () => {
  it("carries only allow-listed, formatted fields", () => {
    const p = toLedgerPayload("6f1c2a52-6d1e-4c51-9f9e-1b2c3d4e5f60", {
      type: "APPROVED",
      documentRef: "cmv18hr6d004nwsvpy1lcxk4a",
      versionId: "cmv18hr6d004nwsvpy1lcxk4b",
      versionNumber: 1,
      sha256: "a".repeat(64),
      signedSha256: "1234567890".repeat(6) + "1234",
      signerKeyId: "ed25519:1234567890123456",
    });
    expect(Object.keys(p).sort()).toEqual(["documentRef", "eventId", "occurredAt", "sha256", "signedSha256", "signerKeyId", "type", "versionId", "versionNumber"]);
  });

  it("the chaincode rules reject personal data and unknown fields", () => {
    const base = { eventId: "6f1c2a52-6d1e-4c51-9f9e-1b2c3d4e5f60", type: "KEY_REVOKED", signerKeyId: "ed25519:0000000000000000", occurredAt: "2026-10-09T10:00:00.000Z" };
    expect(() => validateEvent(base)).not.toThrow();
    for (const extra of [{ studentName: "Aarav" }, { email: "a@vit.edu" }, { prn: "12345678" }, { reason: "bad formatting" }, { pdf: "JVBERi0=" }, { privateKey: "x" }]) {
      expect(() => validateEvent({ ...base, ...extra })).toThrow(/not allowed/);
    }
    expect(() => validateEvent({ ...base, signerKeyId: "aarav@vit.edu" })).toThrow();
    expect(() => validateEvent({ ...base, type: "APPROVED" })).toThrow(/needs/);
  });

  it("idempotency: identical replay is a no-op, different payload is a conflict", () => {
    const e = validateEvent({ eventId: "6f1c2a52-6d1e-4c51-9f9e-1b2c3d4e5f60", type: "KEY_REVOKED", signerKeyId: "ed25519:0000000000000000", occurredAt: "2026-10-09T10:00:00.000Z" });
    const stored = { ...e, txId: "t", txTimestamp: "2026-10-09T10:00:01.000Z", submitterMsp: "Org1MSP" };
    expect(decideRecord(null, e).action).toBe("CREATE");
    expect(decideRecord(stored, e).action).toBe("REPLAY");
    expect(decideRecord(stored, { ...e, signerKeyId: "ed25519:1111111111111111" }).action).toBe("CONFLICT");
  });
});

describe("outbox", () => {
  it("queues SUBMITTED and APPROVED in the same transaction as the business change, with no PII", async () => {
    const { documentId, student } = await signedDoc();
    const rows = await db.ledgerOutbox.findMany({ where: { documentId }, orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.type)).toEqual(["SUBMITTED", "APPROVED"]);
    for (const r of rows) {
      expect(r.payload).not.toContain(student.name);
      expect(r.payload).not.toContain(student.email);
      expect(r.payload).not.toContain("Lab 3");
    }
  });

  it("rejection reasons never reach the payload", async () => {
    const fac = await makeUser("FACULTY");
    const s = await makeUser();
    const { classId, code } = await createClass(fac, validClass, meta());
    await joinClass(s, code, meta());
    const d = await createDocument(s, { classId, typeId: LAB_REPORT, title: "Lab 4" }, { bytes: await makePdf("x"), name: "x.pdf" }, meta());
    await submitDocument(s, d.documentId, d.versionId, meta());
    await decideDocument(fac, d.documentId, { versionId: d.versionId, decision: "REJECT", reason: "Plagiarised from last year's report" }, meta());
    const rej = await db.ledgerOutbox.findFirstOrThrow({ where: { documentId: d.documentId, type: "REJECTED" } });
    expect(rej.payload).not.toMatch(/Plagiarised/);
  });

  it("nothing is queued when the business transaction fails", async () => {
    const fac = await makeUser("FACULTY");
    await createCredential(fac, meta());
    const before = await db.ledgerOutbox.count();
    await expect(createCredential(fac, meta())).rejects.toBeTruthy();
    expect(await db.ledgerOutbox.count()).toBe(before);
  });
});

describe("relay: failures and retries never duplicate", () => {
  it("delivers queued events and marks them confirmed", async () => {
    await signedDoc();
    const out = await relayDue({ ledger });
    expect(out.map((o) => o.result)).toEqual(["CONFIRMED", "CONFIRMED"]);
    expect(ledger.writes).toBe(2);
    expect(await db.ledgerOutbox.count({ where: { status: "CONFIRMED" } })).toBe(2);
  });

  it("ledger down: rows stay pending with backoff, then recover", async () => {
    await signedDoc();
    ledger.down = true;
    const first = await relayDue({ ledger });
    expect(first).toEqual([{ id: expect.any(String), result: "RETRY" }]);
    const row = await db.ledgerOutbox.findFirstOrThrow({ where: { attempts: 1 } });
    expect(row.status).toBe("PENDING");
    expect(row.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(row.lastError).toMatch(/unreachable/);

    ledger.down = false;
    await db.ledgerOutbox.updateMany({ data: { nextAttemptAt: new Date(0) } });
    await relayDue({ ledger });
    expect(await db.ledgerOutbox.count({ where: { status: "CONFIRMED" } })).toBe(2);
    expect(ledger.writes).toBe(2);
  });

  it("crash after the ledger commit, before the DB update: replay confirms without a duplicate", async () => {
    await signedDoc();
    const crash = () => {
      throw new SimulatedCrash("process killed");
    };
    await expect(relayOne(ledger, { afterLedgerCommit: crash })).rejects.toBeInstanceOf(SimulatedCrash);
    expect(ledger.writes).toBe(1);
    expect(await db.ledgerOutbox.count({ where: { status: "PENDING" } })).toBe(2); // DB never heard back

    // The crashed relay's lease still holds: others skip that row and take the next one.
    expect((await relayDue({ ledger })).map((o) => o.result)).toEqual(["CONFIRMED"]);
    // Once the lease expires, the row is replayed and confirmed.
    const out = await relayDue({ ledger, now: new Date(Date.now() + LEASE_MS + 60_000) });
    expect(out.map((o) => o.result)).toEqual(["REPLAYED"]);
    expect(await db.ledgerOutbox.count({ where: { status: "CONFIRMED" } })).toBe(2);
    expect(ledger.writes).toBe(2);
    expect(ledger.events.size).toBe(2);
  });

  it("response lost after commit: retry replays instead of writing twice", async () => {
    await signedDoc();
    ledger.failAfterCommit = 1;
    await relayDue({ ledger });
    await db.ledgerOutbox.updateMany({ where: { status: "PENDING" }, data: { nextAttemptAt: new Date(0) } });
    await relayDue({ ledger });
    expect(ledger.events.size).toBe(2);
    expect(await db.ledgerOutbox.count({ where: { status: "CONFIRMED" } })).toBe(2);
  });

  it("concurrent relays don't double-submit a row", async () => {
    await signedDoc();
    const results = await Promise.all([relayDue({ ledger }), relayDue({ ledger }), relayDue({ ledger })]);
    const ids = results.flat().filter((r) => r.result === "CONFIRMED").map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ledger.writes).toBe(2);
  });

  it("a conflicting payload under the same id is flagged, not overwritten", async () => {
    await signedDoc();
    const row = await db.ledgerOutbox.findFirstOrThrow({ where: { type: "APPROVED" } });
    const tampered = JSON.parse(row.payload);
    tampered.versionNumber = 9;
    await ledger.record(tampered); // someone else wrote this id with different content
    await relayDue({ ledger });
    expect((await db.ledgerOutbox.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("CONFLICT");
    expect(await db.ledgerMismatch.count({ where: { eventId: row.id, kind: "CONFLICT_ON_SUBMIT" } })).toBe(1);
  });
});

describe("reconciliation", () => {
  it("detects missing, altered and unknown on-chain events", async () => {
    await signedDoc();
    await relayDue({ ledger });
    expect((await reconcile(ledger))!.mismatches).toEqual([]);

    const [a, b] = await db.ledgerOutbox.findMany({ orderBy: { createdAt: "asc" } });
    ledger.events.delete(a.id);
    const altered = ledger.events.get(b.id)!;
    ledger.events.set(b.id, { ...altered, sha256: "f".repeat(64) });
    await ledger.record({ eventId: "0b9a4c1e-2f3d-4e5f-8a9b-0c1d2e3f4a5b", type: "KEY_REVOKED", signerKeyId: "ed25519:abcdefabcdefabcd", occurredAt: "2026-10-09T10:00:00.000Z" });

    const kinds = (await reconcile(ledger))!.mismatches.map((m) => m.kind).sort();
    expect(kinds).toEqual(["MISSING_ON_CHAIN", "PAYLOAD_MISMATCH", "UNKNOWN_ON_CHAIN"]);
    // Re-running doesn't duplicate open mismatches.
    await reconcile(ledger);
    expect(await db.ledgerMismatch.count({ where: { resolvedAt: null } })).toBe(3);
  });
});

describe("verification includes the ledger", () => {
  it("not fully verified until the approval is confirmed on-chain", async () => {
    const { pdf } = await signedDoc();
    const pending = await verifyBytes(pdf);
    expect(pending.status).toBe("VALID");
    expect(pending.ledger!.state).toBe("PENDING");
    expect(pending.fullyVerified).toBe(false);

    await relayDue({ ledger });
    const done = await verifyBytes(pdf);
    expect(done.ledger!.state).toBe("CONFIRMED");
    expect(done.ledger!.txId).toMatch(/^[a-f0-9]{64}$/);
    expect(done.fullyVerified).toBe(true);
  });

  it("ledger tampering or outage is never shown as fully verified", async () => {
    const { pdf } = await signedDoc();
    await relayDue({ ledger });
    const row = await db.ledgerOutbox.findFirstOrThrow({ where: { type: "APPROVED" } });

    ledger.down = true;
    const outage = await verifyBytes(pdf);
    expect(outage.ledger!.state).toBe("UNAVAILABLE");
    expect(outage.fullyVerified).toBe(false);
    ledger.down = false;

    const e = ledger.events.get(row.id)!;
    ledger.events.set(row.id, { ...e, signerKeyId: "ed25519:ffffffffffffffff" });
    const tampered = await verifyBytes(pdf);
    expect(tampered.ledger!.state).toBe("MISMATCH");
    expect(tampered.fullyVerified).toBe(false);
  });

  it("key revocation is recorded on-chain and fails verification", async () => {
    const { pdf, fac } = await signedDoc();
    const cred = await db.signingCredential.findFirstOrThrow({ where: { facultyId: fac.id, status: "ACTIVE" } });
    await revokeCredential(fac, cred.id, "compromised", meta());
    await relayDue({ ledger });
    expect([...ledger.events.values()].some((e) => e.type === "KEY_REVOKED" && e.signerKeyId === cred.keyId)).toBe(true);
    const res = await verifyBytes(pdf);
    expect(res.status).toBe("REVOKED");
    expect(res.fullyVerified).toBe(false);
  });

  it("payloads are canonical so the reconciler compares like with like", async () => {
    await signedDoc();
    for (const r of await db.ledgerOutbox.findMany()) expect(canonical(JSON.parse(r.payload))).toBe(r.payload);
  });
});
