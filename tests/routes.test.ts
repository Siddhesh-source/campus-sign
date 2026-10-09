import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClass } from "@/server/classes";
import { joinClass } from "@/server/enrollment";
import { addVersion, createDocument, decideDocument, getDocument, getVersionFile, listInbox, startReview, submitDocument } from "@/server/documents";
import { setRoute } from "@/server/routes";
import { approveAndSign, createCredential, verifyBytes } from "@/server/signing";
import { setLedgerForTests } from "@/server/ledger/client";
import { relayDue } from "@/server/ledger/relay";
import { getFile } from "@/server/storage";
import { LAB_REPORT, makePdf, makeUser, meta, validClass } from "./helpers";
import { MemoryLedger } from "./memory-ledger";

let ledger: MemoryLedger;
beforeEach(() => {
  ledger = new MemoryLedger();
  setLedgerForTests(ledger);
});
afterEach(() => setLedgerForTests(undefined));

async function twoStep() {
  const admin = await makeUser("ADMIN");
  const fac = await makeUser("FACULTY", "Ananya Kulkarni");
  const hod = await makeUser("FACULTY", "Head Of Dept");
  const student = await makeUser("STUDENT", "Aarav Sharma");
  await setRoute(admin, LAB_REPORT, [
    { label: "Class faculty", kind: "CLASS_FACULTY" },
    { label: "Head of Department", kind: "DESIGNATED", approverEmail: hod.email },
  ], meta());
  const { classId, code } = await createClass(fac, validClass, meta());
  await joinClass(student, code, meta());
  await createCredential(fac, meta());
  await createCredential(hod, meta());
  const d = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Internship NOC" }, { bytes: await makePdf("noc"), name: "noc.pdf" }, meta());
  await submitDocument(student, d.documentId, d.versionId, meta());
  return { admin, fac, hod, student, classId, ...d };
}

const sign = (who: Parameters<typeof approveAndSign>[0], d: { documentId: string; versionId: string; sha256: string }) =>
  approveAndSign(who, d.documentId, { versionId: d.versionId, expectedSha256: d.sha256, confirm: true }, meta());

async function signedFile(signatureId: string) {
  const s = await db.signature.findUniqueOrThrow({ where: { id: signatureId } });
  return getFile(s.signedStorageKey);
}

describe("approval routes", () => {
  it("routes class faculty → HoD; each step only by its approver; the HoD sees nothing early", async () => {
    const d = await twoStep();
    // Before step 2, the HoD can't see the document at all.
    expect(await getDocument(d.hod, d.documentId)).toBeNull();
    expect(await getVersionFile(d.hod, d.versionId)).toBeNull();
    await expect(sign(d.hod, d)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await startReview(d.fac, d.documentId, meta());
    const s1 = await sign(d.fac, d);
    expect(s1).toMatchObject({ final: false, nextStep: "Head of Department" });
    const mid = await db.document.findUniqueOrThrow({ where: { id: d.documentId } });
    expect(mid).toMatchObject({ status: "SUBMITTED", currentStep: 2 });

    // Now the HoD can see and act; the class faculty can see but not sign step 2.
    expect(await getDocument(d.hod, d.documentId)).not.toBeNull();
    expect((await listInbox(d.hod, {})).map((x) => x.id)).toContain(d.documentId);
    await expect(sign(d.fac, d)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(decideDocument(d.fac, d.documentId, { versionId: d.versionId, decision: "REJECT", reason: "Changed my mind about it." }, meta())).rejects.toMatchObject({ code: "FORBIDDEN" });

    const s2 = await sign(d.hod, d);
    expect(s2.final).toBe(true);
    expect((await db.document.findUniqueOrThrow({ where: { id: d.documentId } })).status).toBe("APPROVED");

    const sigs = await db.signature.findMany({ where: { documentId: d.documentId }, orderBy: { stepOrder: "asc" } });
    expect(sigs.map((s) => [s.stepOrder, s.totalSteps])).toEqual([[1, 2], [2, 2]]);
    expect(sigs[1].previousSignatureId).toBe(sigs[0].id);
  });

  it("an intermediate file is never fully verified; the final file is, once on-chain", async () => {
    const d = await twoStep();
    const s1 = await sign(d.fac, d);
    const s2 = await sign(d.hod, d);
    await relayDue({ ledger });

    const mid = await verifyBytes(await signedFile(s1.signatureId));
    expect(mid).toMatchObject({ status: "VALID", complete: false, nextStepLabel: "Head of Department", fullyVerified: false });

    const fin = await verifyBytes(await signedFile(s2.signatureId));
    expect(fin).toMatchObject({ status: "VALID", complete: true, fullyVerified: true });
    expect(fin.chain!.map((c) => [c.stepLabel, c.signerName, c.ledger.state])).toEqual([
      ["Class faculty", "Ananya Kulkarni", "CONFIRMED"],
      ["Head of Department", "Head Of Dept", "CONFIRMED"],
    ]);
    expect(JSON.stringify(fin)).not.toContain(d.student.email);
    const approvals = [...ledger.events.values()].filter((e) => e.type === "APPROVED");
    expect(approvals.map((e) => [e.stepOrder, e.totalSteps]).sort()).toEqual([[1, 2], [2, 2]]);
  });

  it("tampering with an earlier step breaks the whole chain", async () => {
    const d = await twoStep();
    const s1 = await sign(d.fac, d);
    const s2 = await sign(d.hod, d);
    await relayDue({ ledger });
    await db.$transaction([
      db.$executeRawUnsafe("SET LOCAL session_replication_role = replica"),
      db.$executeRawUnsafe(`UPDATE "signature" SET "signedSha256" = '${"0".repeat(64)}' WHERE "id" = '${s1.signatureId}'`),
    ]);
    const res = await verifyBytes(await signedFile(s2.signatureId));
    expect(res.status).toBe("INVALID_SIGNATURE");
    expect(res.fullyVerified).toBe(false);
  });

  it("a rejection at step 2 returns it to the student; resubmission restarts at step 1", async () => {
    const d = await twoStep();
    await sign(d.fac, d);
    await decideDocument(d.hod, d.documentId, { versionId: d.versionId, decision: "REQUEST_CORRECTIONS", reason: "Attach the company letterhead." }, meta());
    const v2 = await addVersion(d.student, d.documentId, { bytes: await makePdf("noc v2"), name: "noc2.pdf" }, meta());
    await submitDocument(d.student, d.documentId, v2.versionId, meta());
    const doc = await db.document.findUniqueOrThrow({ where: { id: d.documentId } });
    expect(doc).toMatchObject({ status: "SUBMITTED", currentStep: 1 });
    await expect(sign(d.hod, { ...d, versionId: v2.versionId, sha256: v2.sha256 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("editing a route doesn't change documents already in flight", async () => {
    const d = await twoStep();
    await setRoute(d.admin, LAB_REPORT, [{ label: "Class faculty", kind: "CLASS_FACULTY" }], meta());
    await sign(d.fac, d);
    expect((await db.document.findUniqueOrThrow({ where: { id: d.documentId } })).status).toBe("SUBMITTED"); // still needs the HoD
  });

  it("only verified faculty can be named as approvers", async () => {
    const admin = await makeUser("ADMIN");
    const student = await makeUser("STUDENT");
    await expect(setRoute(admin, LAB_REPORT, [{ label: "HoD", kind: "DESIGNATED", approverEmail: student.email }], meta())).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(setRoute(admin, LAB_REPORT, [{ label: "HoD", kind: "DESIGNATED", approverEmail: "x@gmail.com" }], meta())).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});
