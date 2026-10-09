/**
 * Access-control proof. Two layers:
 *  1. Behaviour: every document/file/signing/credential operation, tried by
 *     every kind of actor, must be refused unless the actor is entitled.
 *  2. Source guards: every server action, API route and admin page must call
 *     its authorization helper, so a new endpoint can't silently skip it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClass, revokeCode, rotateCode } from "@/server/classes";
import { joinClass } from "@/server/enrollment";
import { addVersion, createDocument, decideDocument, getDocument, getVersionFile, listInbox, startReview, submitDocument } from "@/server/documents";
import { approveAndSign, createCredential, getSignedFile, revokeCredential, rotateCredential } from "@/server/signing";
import { LAB_REPORT, makePdf, makeUser, meta, validClass } from "./helpers";

async function world() {
  const facA = await makeUser("FACULTY", "Faculty A");
  const facB = await makeUser("FACULTY", "Faculty B");
  const studentA = await makeUser("STUDENT", "Student A");
  const studentB = await makeUser("STUDENT", "Student B");
  const admin = await makeUser("ADMIN", "Admin");
  const classA = await createClass(facA, validClass, meta());
  const classB = await createClass(facB, { ...validClass, division: "C" }, meta());
  await joinClass(studentA, classA.code, meta());
  await joinClass(studentB, classB.code, meta());
  await createCredential(facA, meta());
  await createCredential(facB, meta());
  const doc = await createDocument(studentA, { classId: classA.classId, typeId: LAB_REPORT, title: "A's report" }, { bytes: await makePdf("a"), name: "a.pdf" }, meta());
  return { facA, facB, studentA, studentB, admin, classA, classB, doc };
}

const signInput = (d: { versionId: string; sha256: string }) => ({ versionId: d.versionId, expectedSha256: d.sha256, confirm: true });

describe("documents: only the owner and the class faculty", () => {
  it("other students, other faculty and admins can't read, list or touch a document", async () => {
    const w = await world();
    await submitDocument(w.studentA, w.doc.documentId, w.doc.versionId, meta());
    for (const outsider of [w.studentB, w.facB, w.admin]) {
      expect(await getDocument(outsider, w.doc.documentId)).toBeNull();
      expect(await getVersionFile(outsider, w.doc.versionId)).toBeNull();
      await expect(addVersion(outsider, w.doc.documentId, { bytes: await makePdf("x"), name: "x.pdf" }, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(startReview(outsider, w.doc.documentId, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        decideDocument(outsider, w.doc.documentId, { versionId: w.doc.versionId, decision: "REJECT", reason: "Not my document at all." }, meta()),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect((await listInbox(w.facB, { status: "SUBMITTED" })).map((d) => d.id)).not.toContain(w.doc.documentId);
    expect(await getDocument(w.studentA, w.doc.documentId)).not.toBeNull();
    expect(await getDocument(w.facA, w.doc.documentId)).not.toBeNull();
  });

  it("students can't submit into a class they aren't enrolled in", async () => {
    const w = await world();
    await expect(
      createDocument(w.studentB, { classId: w.classA.classId, typeId: LAB_REPORT, title: "Sneaky" }, { bytes: await makePdf("s"), name: "s.pdf" }, meta()),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("faculty can't submit or edit on a student's behalf", async () => {
    const w = await world();
    await expect(submitDocument(w.facA, w.doc.documentId, w.doc.versionId, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(addVersion(w.facA, w.doc.documentId, { bytes: await makePdf("f"), name: "f.pdf" }, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("signing: nobody can sign on behalf of the class faculty", () => {
  it("students, admins and other faculty are refused; the faculty signs only with their own key", async () => {
    const w = await world();
    await submitDocument(w.studentA, w.doc.documentId, w.doc.versionId, meta());
    for (const who of [w.studentA, w.studentB, w.admin]) {
      await expect(approveAndSign(who, w.doc.documentId, signInput(w.doc), meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await expect(approveAndSign(w.facB, w.doc.documentId, signInput(w.doc), meta())).rejects.toMatchObject({ code: "NOT_FOUND" });

    const sig = await approveAndSign(w.facA, w.doc.documentId, signInput(w.doc), meta());
    const row = await db.signature.findUniqueOrThrow({ where: { id: sig.signatureId }, include: { credential: true } });
    expect(row.credential.facultyId).toBe(w.facA.id);
  });

  it("a faculty member whose access was revoked can't sign, even mid-session", async () => {
    const w = await world();
    await submitDocument(w.studentA, w.doc.documentId, w.doc.versionId, meta());
    await db.facultyAccess.update({ where: { email: w.facA.email }, data: { status: "REVOKED" } });
    await expect(approveAndSign(w.facA, w.doc.documentId, signInput(w.doc), meta())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rotated and revoked keys can't sign", async () => {
    const w = await world();
    await submitDocument(w.studentA, w.doc.documentId, w.doc.versionId, meta());
    const old = await db.signingCredential.findFirstOrThrow({ where: { facultyId: w.facA.id, status: "ACTIVE" } });
    await rotateCredential(w.facA, meta());
    const fresh = await db.signingCredential.findFirstOrThrow({ where: { facultyId: w.facA.id, status: "ACTIVE" } });
    await revokeCredential(w.facA, fresh.id, "lost laptop", meta());
    await expect(approveAndSign(w.facA, w.doc.documentId, signInput(w.doc), meta())).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(old.id).not.toBe(fresh.id);
  });

  it("credentials: only the owner (or an admin) can revoke; nobody else", async () => {
    const w = await world();
    const keyA = await db.signingCredential.findFirstOrThrow({ where: { facultyId: w.facA.id } });
    for (const who of [w.facB, w.studentA]) {
      await expect(revokeCredential(who, keyA.id, "x", meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    await revokeCredential(w.admin, keyA.id, "admin action", meta());
    expect((await db.signingCredential.findUniqueOrThrow({ where: { id: keyA.id } })).status).toBe("REVOKED");
  });

  it("signed PDFs are only downloadable by the owner and the class faculty", async () => {
    const w = await world();
    await submitDocument(w.studentA, w.doc.documentId, w.doc.versionId, meta());
    const sig = await approveAndSign(w.facA, w.doc.documentId, signInput(w.doc), meta());
    for (const outsider of [w.studentB, w.facB, w.admin]) expect(await getSignedFile(outsider, sig.signatureId)).toBeNull();
    expect(await getSignedFile(w.studentA, sig.signatureId)).not.toBeNull();
    expect(await getSignedFile(w.facA, sig.signatureId)).not.toBeNull();
  });
});

describe("classes: only the owning faculty manages codes", () => {
  it("other faculty get NOT_FOUND", async () => {
    const w = await world();
    await expect(rotateCode(w.facB, w.classA.classId, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revokeCode(w.facB, w.classA.classId, meta())).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ── Source guards ──────────────────────────────────────────────────────────

const root = path.resolve(__dirname, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

function walk(dir: string, match: (f: string) => boolean): string[] {
  const out: string[] = [];
  for (const name of readdirSync(path.join(root, dir))) {
    const rel = path.join(dir, name);
    if (statSync(path.join(root, rel)).isDirectory()) out.push(...walk(rel, match));
    else if (match(name)) out.push(rel.replace(/\\/g, "/"));
  }
  return out;
}

describe("source guards", () => {
  it("every server action authorizes (except the public verify lookup)", () => {
    const src = read("src/app/actions.ts");
    const fns = [...src.matchAll(/export async function (\w+)\(([\s\S]*?)\n}\n/g)];
    expect(fns.length).toBeGreaterThan(20);
    const PUBLIC = new Set(["verifyHashAction"]);
    for (const [, name, body] of fns) {
      if (PUBLIC.has(name)) continue;
      expect(body, `${name} must call requireActor`).toMatch(/requireActor\(/);
    }
  });

  it("every API route checks the session (auth handler excepted)", () => {
    for (const f of walk("src/app/api", (n) => n === "route.ts")) {
      if (f.includes("/api/auth/")) continue;
      expect(read(f), `${f} must authorize`).toMatch(/getCurrentUser\(|jsonAction\(/);
    }
  });

  it("every admin page requires the ADMIN role", () => {
    for (const f of walk("src/app/(app)/admin", (n) => n === "page.tsx")) {
      expect(read(f), `${f} must require ADMIN`).toMatch(/requirePageUser\("ADMIN"\)/);
    }
  });

  it("every signed-in page sits behind the authenticated layout", () => {
    expect(read("src/app/(app)/layout.tsx")).toMatch(/requirePageUser\(\)/);
  });
});
