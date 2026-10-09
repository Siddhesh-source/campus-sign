import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClass } from "@/server/classes";
import { joinClass } from "@/server/enrollment";
import {
  addVersion,
  createDocument,
  decideDocument,
  getDocument,
  getVersionFile,
  listInbox,
  startReview,
  submitDocument,
} from "@/server/documents";
import { LAB_REPORT, makePdf, makeUser, meta, validClass } from "./helpers";

async function setup() {
  const fac = await makeUser("FACULTY", "Ananya Kulkarni");
  const student = await makeUser("STUDENT", "Aarav Sharma");
  const { classId, code } = await createClass(fac, validClass, meta());
  await joinClass(student, code, meta());
  return { fac, student, classId };
}

const file = async (text?: string) => ({ bytes: await makePdf(text), name: "report.pdf" });

describe("upload + versions", () => {
  it("stores a hashed draft v1 computed by the server", async () => {
    const { student, classId } = await setup();
    const f = await file();
    const { documentId, sha256 } = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Lab 3: Graphs" }, f, meta());
    expect(sha256).toBe(createHash("sha256").update(f.bytes).digest("hex"));
    const doc = await db.document.findUniqueOrThrow({ where: { id: documentId }, include: { versions: true } });
    expect(doc.status).toBe("DRAFT");
    expect(doc.versions).toHaveLength(1);
    expect(doc.versions[0]).toMatchObject({ number: 1, sha256, pageCount: 1, submittedAt: null });
  });

  it("rejects non-PDFs, empty files and students outside the class", async () => {
    const { student, classId } = await setup();
    const outsider = await makeUser("STUDENT");
    const input = { classId, typeId: LAB_REPORT, title: "Lab 3" };
    await expect(createDocument(student, input, { bytes: new TextEncoder().encode("hello"), name: "x.pdf" }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createDocument(student, input, { bytes: new Uint8Array(), name: "x.pdf" }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    const fake = new TextEncoder().encode("%PDF-1.7 not really a pdf");
    await expect(createDocument(student, input, { bytes: fake, name: "x.pdf" }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(createDocument(outsider, input, await file(), meta())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("submitting locks the version; uploads are refused until corrections are requested", async () => {
    const { student, fac, classId } = await setup();
    const { documentId, versionId } = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Lab 3" }, await file("v1"), meta());
    await submitDocument(student, documentId, versionId, meta());
    await expect(addVersion(student, documentId, await file("v2"), meta())).rejects.toMatchObject({ code: "STALE" });
    // The database itself refuses to alter a submitted version.
    await expect(db.documentVersion.update({ where: { id: versionId }, data: { sha256: "0".repeat(64) } })).rejects.toThrow(/locked/);

    await startReview(fac, documentId, meta());
    await decideDocument(fac, documentId, { versionId, decision: "REQUEST_CORRECTIONS", reason: "Add the adjacency matrix for Q2." }, meta());
    const v2 = await addVersion(student, documentId, await file("v2"), meta());
    expect(v2.number).toBe(2);
    await submitDocument(student, documentId, v2.versionId, meta());

    const doc = await getDocument(student, documentId);
    expect(doc!.versions.map((v) => v.number)).toEqual([2, 1]);
    expect(doc!.versions.every((v) => v.submittedAt)).toBe(true);
    expect(doc!.events.map((e) => e.type)).toEqual([
      "CREATED",
      "VERSION_UPLOADED",
      "SUBMITTED",
      "REVIEW_STARTED",
      "CORRECTIONS_REQUESTED",
      "VERSION_UPLOADED",
      "SUBMITTED",
    ]);
    expect(doc!.events.find((e) => e.type === "CORRECTIONS_REQUESTED")!.reason).toMatch(/adjacency/);
  });
});

describe("review decisions", () => {
  it("refuses a decision on a version that isn't current, and requires a reason", async () => {
    const { student, fac, classId } = await setup();
    const { documentId, versionId } = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Lab 3" }, await file(), meta());
    await submitDocument(student, documentId, versionId, meta());
    await expect(decideDocument(fac, documentId, { versionId, decision: "REJECT", reason: "no" }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(decideDocument(fac, documentId, { versionId: "other", decision: "REJECT", reason: "Wrong experiment entirely." }, meta())).rejects.toMatchObject({ code: "STALE" });
    await decideDocument(fac, documentId, { versionId, decision: "REJECT", reason: "Wrong experiment entirely." }, meta());
    await expect(decideDocument(fac, documentId, { versionId, decision: "REQUEST_CORRECTIONS", reason: "Changed my mind about this." }, meta())).rejects.toMatchObject({ code: "STALE" });
    expect((await db.document.findUniqueOrThrow({ where: { id: documentId } })).status).toBe("REJECTED");
  });

  it("inbox shows only this faculty's submitted documents and filters by status", async () => {
    const { student, fac, classId } = await setup();
    const other = await setup();
    const a = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Mine" }, await file(), meta());
    await createDocument(student, { classId, typeId: LAB_REPORT, title: "Draft" }, await file(), meta());
    await submitDocument(student, a.documentId, a.versionId, meta());
    const b = await createDocument(other.student, { classId: other.classId, typeId: LAB_REPORT, title: "Theirs" }, await file(), meta());
    await submitDocument(other.student, b.documentId, b.versionId, meta());

    const inbox = await listInbox(fac, {});
    expect(inbox.map((d) => d.title)).toEqual(["Mine"]);
    expect(await listInbox(fac, { status: "APPROVED" })).toHaveLength(0);
  });
});

describe("isolation", () => {
  it("other students, other faculty and admins can't see a document or its file", async () => {
    const { student, fac, classId } = await setup();
    const { documentId, versionId } = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Private" }, await file(), meta());
    const otherStudent = await makeUser("STUDENT");
    const otherFaculty = await makeUser("FACULTY");
    const admin = await makeUser("ADMIN");
    for (const who of [otherStudent, otherFaculty, admin]) {
      expect(await getDocument(who, documentId)).toBeNull();
      expect(await getVersionFile(who, versionId)).toBeNull();
      await expect(submitDocument(who, documentId, versionId, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    // The class faculty can't open a draft either: only what was submitted.
    expect(await getVersionFile(fac, versionId)).toBeNull();
    await submitDocument(student, documentId, versionId, meta());
    expect(await getVersionFile(fac, versionId)).not.toBeNull();
    await expect(startReview(otherFaculty, documentId, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
