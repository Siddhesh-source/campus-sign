import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClass } from "@/server/classes";
import { joinClass } from "@/server/enrollment";
import { createDocument, startReview, submitDocument } from "@/server/documents";
import { decideFacultyAccess } from "@/server/faculty";
import {
  approveAndSign,
  canonicalJson,
  createCredential,
  revokeCredential,
  rotateCredential,
  verifyBytes,
  verifyCode,
  verifyHash,
} from "@/server/signing";
import { getFile } from "@/server/storage";
import { LAB_REPORT, makePdf, makeUser, meta, validClass } from "./helpers";

async function submitted() {
  const fac = await makeUser("FACULTY", "Ananya Kulkarni");
  const student = await makeUser("STUDENT", "Aarav Sharma");
  const { classId, code } = await createClass(fac, validClass, meta());
  await joinClass(student, code, meta());
  const doc = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Lab 3: Graph traversal" }, { bytes: await makePdf(), name: "lab3.pdf" }, meta());
  await submitDocument(student, doc.documentId, doc.versionId, meta());
  await startReview(fac, doc.documentId, meta());
  return { fac, student, classId, ...doc };
}

async function signed() {
  const s = await submitted();
  await createCredential(s.fac, meta());
  const sig = await approveAndSign(s.fac, s.documentId, { versionId: s.versionId, expectedSha256: s.sha256, confirm: true }, meta());
  const row = await db.signature.findUniqueOrThrow({ where: { id: sig.signatureId } });
  const pdf = await getFile(row.signedStorageKey);
  return { ...s, sig, pdf };
}

describe("credentials", () => {
  it("stores the private key encrypted, never as PEM", async () => {
    const fac = await makeUser("FACULTY");
    const cred = await createCredential(fac, meta());
    const row = await db.signingCredential.findUniqueOrThrow({ where: { id: cred.id } });
    expect(row.encryptedPrivateKey).toMatch(/^v1\./);
    expect(row.encryptedPrivateKey).not.toMatch(/PRIVATE KEY/);
    expect(row.publicKeyPem).toMatch(/BEGIN PUBLIC KEY/);
    await expect(createCredential(fac, meta())).rejects.toMatchObject({ code: "STALE" });
    const next = await rotateCredential(fac, meta());
    expect(next.keyId).not.toBe(cred.keyId);
    expect((await db.signingCredential.findUniqueOrThrow({ where: { id: cred.id } })).status).toBe("ROTATED");
  });

  it("students can't hold credentials", async () => {
    await expect(createCredential(await makeUser("STUDENT"), meta())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("approve & sign", () => {
  it("requires explicit confirmation, the reviewed hash, and an active credential", async () => {
    const s = await submitted();
    const input = { versionId: s.versionId, expectedSha256: s.sha256, confirm: true };
    await expect(approveAndSign(s.fac, s.documentId, { ...input, confirm: false }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(approveAndSign(s.fac, s.documentId, input, meta())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await createCredential(s.fac, meta());
    await expect(approveAndSign(s.fac, s.documentId, { ...input, expectedSha256: "a".repeat(64) }, meta())).rejects.toMatchObject({ code: "STALE" });
    const otherFaculty = await makeUser("FACULTY");
    await createCredential(otherFaculty, meta());
    await expect(approveAndSign(otherFaculty, s.documentId, input, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });

    await approveAndSign(s.fac, s.documentId, input, meta());
    const doc = await db.document.findUniqueOrThrow({ where: { id: s.documentId } });
    expect(doc.status).toBe("APPROVED");
    await expect(approveAndSign(s.fac, s.documentId, input, meta())).rejects.toMatchObject({ code: "STALE" });
  });

  it("re-checks faculty access at signing time", async () => {
    const s = await submitted();
    await createCredential(s.fac, meta());
    await db.facultyAccess.update({ where: { email: s.fac.email }, data: { status: "REVOKED" } });
    await expect(
      approveAndSign(s.fac, s.documentId, { versionId: s.versionId, expectedSha256: s.sha256, confirm: true }, meta()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("binds hash, version, decision and context into the signed payload", async () => {
    const { sig, sha256, versionId, documentId, classId } = await signed();
    const row = await db.signature.findUniqueOrThrow({ where: { id: sig.signatureId } });
    const payload = JSON.parse(row.payload);
    expect(payload).toMatchObject({
      v: 1,
      documentId,
      versionId,
      versionNumber: 1,
      classId,
      documentType: "LAB_REPORT",
      decision: "APPROVED",
      originalSha256: sha256,
      signedSha256: sig.signedSha256,
    });
    expect(canonicalJson(payload)).toBe(row.payload);
  });
});

describe("public verification", () => {
  it("a signed PDF verifies; flipping a single byte fails", async () => {
    const { pdf, sig } = await signed();
    const ok = await verifyBytes(pdf);
    expect(ok.status).toBe("VALID");
    expect(ok.record!.code).toBe(sig.code);

    for (const i of [0, Math.floor(pdf.length / 2), pdf.length - 1]) {
      const tampered = Buffer.from(pdf);
      tampered[i] ^= 0x01;
      expect((await verifyBytes(tampered)).status).toBe("MODIFIED_OR_UNKNOWN");
    }
  });

  it("an unknown document fails, and the unsigned original is identified as such", async () => {
    expect((await verifyBytes(await makePdf("never uploaded"))).status).toBe("MODIFIED_OR_UNKNOWN");
    const { sha256 } = await signed();
    expect(await verifyHash(sha256)).toEqual({ status: "MODIFIED_OR_UNKNOWN", isUnsignedOriginal: true });
    expect((await verifyHash("not-a-hash")).status).toBe("MODIFIED_OR_UNKNOWN");
  });

  it("a revoked credential fails verification; a rotated one still verifies", async () => {
    const a = await signed();
    await rotateCredential(a.fac, meta());
    expect((await verifyBytes(a.pdf)).status).toBe("VALID");

    const b = await signed();
    const cred = await db.signingCredential.findFirstOrThrow({ where: { facultyId: b.fac.id, status: "ACTIVE" } });
    await revokeCredential(b.fac, cred.id, "Laptop lost", meta());
    const res = await verifyBytes(b.pdf);
    expect(res.status).toBe("REVOKED");
    expect(res.record!.credentialStatus).toBe("REVOKED");
  });

  it("revoking faculty access revokes their keys", async () => {
    const s = await signed();
    const admin = await makeUser("ADMIN");
    const access = await db.facultyAccess.findUniqueOrThrow({ where: { email: s.fac.email } });
    await decideFacultyAccess(admin, access.id, "revoke", meta());
    expect((await verifyBytes(s.pdf)).status).toBe("REVOKED");
  });

  it("a tampered database record fails the signature check", async () => {
    const { pdf, sig } = await signed();
    // Bypass the append-only trigger to simulate an attacker with DB access.
    await db.$transaction([
      db.$executeRawUnsafe("SET LOCAL session_replication_role = replica"),
      db.$executeRawUnsafe(`UPDATE "signature" SET "decision" = 'REJECTED' WHERE "id" = '${sig.signatureId}'`),
    ]);
    expect((await verifyBytes(pdf)).status).toBe("INVALID_SIGNATURE");
  });

  it("reveals no student personal details", async () => {
    const { pdf, sig, student } = await signed();
    for (const res of [await verifyBytes(pdf), await verifyCode(sig.code)]) {
      const json = JSON.stringify(res);
      expect(json).not.toContain(student.name);
      expect(json).not.toContain(student.email);
      expect(json).not.toContain("Graph traversal");
      expect(res!.record!.signerName).toBe("Ananya Kulkarni");
    }
  });

  it("code lookup confirms the record", async () => {
    const { sig } = await signed();
    expect((await verifyCode(sig.code.toLowerCase()))!.status).toBe("VALID");
    expect(await verifyCode("CS-AAAA-BBBB-CCCC")).toBeNull();
    expect(await verifyCode("garbage")).toBeNull();
  });
});
