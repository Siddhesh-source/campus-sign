import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClass } from "@/server/classes";
import { joinClass } from "@/server/enrollment";
import { createDocument, submitDocument } from "@/server/documents";
import { approveAndSign, createCredential, rotateKek, verifyBytes } from "@/server/signing";
import { documentsSignedByKey } from "@/server/admin";
import { getFile } from "@/server/storage";
import { LAB_REPORT, makePdf, makeUser, meta, validClass } from "./helpers";

const ORIGINAL_KEK = process.env.SIGNING_KEK!;
afterEach(() => {
  process.env.SIGNING_KEK = ORIGINAL_KEK;
});

async function signedDoc(label: string) {
  const fac = await makeUser("FACULTY");
  const s = await makeUser();
  const { classId, code } = await createClass(fac, validClass, meta());
  await joinClass(s, code, meta());
  await createCredential(fac, meta());
  const d = await createDocument(s, { classId, typeId: LAB_REPORT, title: label }, { bytes: await makePdf(label), name: "x.pdf" }, meta());
  await submitDocument(s, d.documentId, d.versionId, meta());
  const sig = await approveAndSign(fac, d.documentId, { versionId: d.versionId, expectedSha256: d.sha256, confirm: true }, meta());
  return { fac, s, classId, d, sig };
}

describe("KEK rotation", () => {
  it("re-encrypts every key; signing keeps working under the new KEK and old signatures still verify", async () => {
    const a = await signedDoc("before");
    const before = await db.signingCredential.findMany({ select: { id: true, encryptedPrivateKey: true } });
    const next = randomBytes(32).toString("base64");

    const res = await rotateKek(ORIGINAL_KEK, next);
    expect(res.rotated).toBe(before.length);
    const after = await db.signingCredential.findMany({ select: { id: true, encryptedPrivateKey: true } });
    for (const b of before) expect(after.find((x) => x.id === b.id)!.encryptedPrivateKey).not.toBe(b.encryptedPrivateKey);

    process.env.SIGNING_KEK = next;
    const s2 = await makeUser();
    await joinClass(s2, (await db.classCode.findFirstOrThrow({ where: { classId: a.classId, status: "ACTIVE" } })).code, meta());
    const d2 = await createDocument(s2, { classId: a.classId, typeId: LAB_REPORT, title: "after" }, { bytes: await makePdf("after"), name: "y.pdf" }, meta());
    await submitDocument(s2, d2.documentId, d2.versionId, meta());
    await approveAndSign(a.fac, d2.documentId, { versionId: d2.versionId, expectedSha256: d2.sha256, confirm: true }, meta());

    const oldRow = await db.signature.findUniqueOrThrow({ where: { id: a.sig.signatureId } });
    expect((await verifyBytes(await getFile(oldRow.signedStorageKey))).status).toBe("VALID");
  });

  it("a wrong old KEK changes nothing (all-or-nothing)", async () => {
    await signedDoc("rollback");
    const before = await db.signingCredential.findMany({ select: { encryptedPrivateKey: true }, orderBy: { id: "asc" } });
    await expect(rotateKek(randomBytes(32).toString("base64"), randomBytes(32).toString("base64"))).rejects.toThrow();
    const after = await db.signingCredential.findMany({ select: { encryptedPrivateKey: true }, orderBy: { id: "asc" } });
    expect(after).toEqual(before);
  });
});

describe("key compromise tooling", () => {
  it("lists every document a key signed, with no student identity", async () => {
    const { fac, s, sig } = await signedDoc("compromised");
    const key = await db.signingCredential.findFirstOrThrow({ where: { facultyId: fac.id } });
    const res = await documentsSignedByKey(key.keyId);
    expect(res!.signatures.map((x) => x.code)).toEqual([sig.code]);
    const json = JSON.stringify(res);
    expect(json).not.toContain(s.email);
    expect(json).not.toContain("compromised"); // document title
  });
});
