import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClass, removeStudent, revokeCode, rotateCode, setCodeExpiry } from "@/server/classes";
import { joinClass, lookupCode } from "@/server/enrollment";
import { UserFacingError } from "@/server/errors";
import { makeUser, meta, validClass } from "./helpers";

describe("createClass", () => {
  it("creates the class, one ACTIVE code and an audit row", async () => {
    const fac = await makeUser("FACULTY");
    const { classId, code } = await createClass(fac, validClass, meta());
    expect(code).toMatch(/^VIT-CS26-[A-Z2-9]{5}$/);
    const codes = await db.classCode.findMany({ where: { classId } });
    expect(codes).toHaveLength(1);
    expect(codes[0].status).toBe("ACTIVE");
    expect(codes[0].expiresAt!.getTime()).toBeGreaterThan(Date.now() + 6.9 * 86_400_000);
    const audit = await db.auditEvent.findMany({ where: { action: "class.create", targetId: classId } });
    expect(audit).toHaveLength(1);
    expect(audit[0].actorEmail).toBe(fac.email);
  });

  it("rejects bad input with field errors and writes nothing", async () => {
    const fac = await makeUser("FACULTY");
    const err = await createClass(fac, { ...validClass, studentLimit: "0", academicYear: "2026-29", division: "" }, meta()).catch((e) => e);
    expect(err).toBeInstanceOf(UserFacingError);
    expect(err.code).toBe("VALIDATION");
    expect(Object.keys(err.fieldErrors)).toEqual(expect.arrayContaining(["studentLimit", "academicYear", "division"]));
    expect(await db.class.count()).toBe(0);
  });
});

describe("code management", () => {
  it("rotate retires the old code immediately and keeps one ACTIVE code", async () => {
    const fac = await makeUser("FACULTY");
    const student = await makeUser("STUDENT");
    const { classId, code: oldCode } = await createClass(fac, validClass, meta());
    const { code: newCode } = await rotateCode(fac, classId, meta());
    expect(newCode).not.toBe(oldCode);

    const active = await db.classCode.findMany({ where: { classId, status: "ACTIVE" } });
    expect(active.map((c) => c.code)).toEqual([newCode]);

    await expect(lookupCode(student, oldCode, meta())).rejects.toMatchObject({ code: "CODE_INVALID" });
    await expect(lookupCode(student, newCode, meta())).resolves.toMatchObject({ classId });
  });

  it("other faculty cannot touch a class (no existence leak)", async () => {
    const owner = await makeUser("FACULTY");
    const other = await makeUser("FACULTY");
    const { classId } = await createClass(owner, validClass, meta());
    for (const op of [() => rotateCode(other, classId, meta()), () => revokeCode(other, classId, meta()), () => setCodeExpiry(other, classId, "7", meta())]) {
      await expect(op()).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
  });

  it("revoked and expired codes look identical to unknown codes", async () => {
    const fac = await makeUser("FACULTY");
    const a = await createClass(fac, validClass, meta());
    const b = await createClass(fac, { ...validClass, division: "C" }, meta());
    await revokeCode(fac, a.classId, meta());
    await setCodeExpiry(fac, b.classId, "now", meta());

    // Fresh student per attempt so the "attempts left" counter is the same for each.
    const messages: string[] = [];
    for (const c of [a.code, b.code, "VIT-CS26-ZZZZZ"]) {
      const who = await makeUser();
      messages.push(await lookupCode(who, c, meta()).catch((e: UserFacingError) => `${e.code}:${e.message}`) as string);
    }
    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toMatch(/^CODE_INVALID:/);
  });

  it("removed students lose their seat and can't rejoin with the code", async () => {
    const fac = await makeUser("FACULTY");
    const s = await makeUser("STUDENT");
    const { classId, code } = await createClass(fac, validClass, meta());
    const { enrollmentId } = await joinClass(s, code, meta());
    await removeStudent(fac, classId, enrollmentId, meta());
    await expect(joinClass(s, code, meta())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(removeStudent(fac, classId, enrollmentId, meta())).rejects.toMatchObject({ code: "STALE" });
  });
});
