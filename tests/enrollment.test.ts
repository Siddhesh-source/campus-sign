import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { createClass } from "@/server/classes";
import { getStudentClasses, joinClass, leaveClass, lookupCode } from "@/server/enrollment";
import { LIMITS } from "@/server/rate-limit";
import { makeUser, meta, validClass } from "./helpers";

describe("join flow (auto-approved)", () => {
  it("preview shows class + verified faculty, join is instant and shows on the dashboard", async () => {
    const fac = await makeUser("FACULTY", "Ananya Kulkarni");
    const s = await makeUser("STUDENT", "Aarav Sharma");
    const { classId, code } = await createClass(fac, validClass, meta());

    const preview = await lookupCode(s, code.toLowerCase().replace(/-/g, " "), meta());
    expect(preview).toMatchObject({
      classId,
      name: validClass.name,
      faculty: { name: "Ananya Kulkarni", email: fac.email, verified: true },
      enrolled: 0,
      studentLimit: 60,
      membership: "NONE",
    });

    await joinClass(s, code, meta());
    const mine = await getStudentClasses(s.id);
    expect(mine.map((c) => c.classId)).toEqual([classId]);
    expect(await db.auditEvent.count({ where: { action: "enrollment.join", actorId: s.id } })).toBe(1);
  });

  it("rejects a second join and a full class", async () => {
    const fac = await makeUser("FACULTY");
    const [a, b] = [await makeUser(), await makeUser()];
    const { code } = await createClass(fac, { ...validClass, studentLimit: "1" }, meta());
    await joinClass(a, code, meta());
    await expect(joinClass(a, code, meta())).rejects.toMatchObject({ code: "ALREADY_ENROLLED" });
    await expect(joinClass(b, code, meta())).rejects.toMatchObject({ code: "CLASS_FULL" });
  });

  it("two students racing for the last seat: exactly one gets in", async () => {
    const fac = await makeUser("FACULTY");
    const students = await Promise.all(Array.from({ length: 6 }, () => makeUser()));
    const { classId, code } = await createClass(fac, { ...validClass, studentLimit: "1" }, meta());
    const results = await Promise.allSettled(students.map((s) => joinClass(s, code, meta())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.enrollment.count({ where: { classId, status: "ACTIVE" } })).toBe(1);
  });

  it("a student who left can rejoin with a valid code", async () => {
    const fac = await makeUser("FACULTY");
    const s = await makeUser();
    const { code } = await createClass(fac, validClass, meta());
    const { enrollmentId } = await joinClass(s, code, meta());
    await leaveClass(s, enrollmentId, meta());
    expect(await getStudentClasses(s.id)).toHaveLength(0);
    await joinClass(s, code, meta());
    expect(await getStudentClasses(s.id)).toHaveLength(1);
  });
});

describe("brute-force protection", () => {
  it(`locks a user after ${LIMITS.user.max} wrong codes, even for a correct code`, async () => {
    const fac = await makeUser("FACULTY");
    const s = await makeUser();
    const { code } = await createClass(fac, validClass, meta());
    const ip = "203.0.113.7";

    for (let i = 0; i < LIMITS.user.max - 1; i++) {
      await expect(lookupCode(s, `VIT-CS26-WRNG${i}`, meta(ip))).rejects.toMatchObject({ code: "CODE_INVALID" });
    }
    await expect(lookupCode(s, "VIT-CS26-WRNGX", meta(ip))).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(lookupCode(s, code, meta(ip))).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await expect(joinClass(s, code, meta(ip))).rejects.toMatchObject({ code: "RATE_LIMITED" });

    expect(await db.auditEvent.count({ where: { action: "code.lookup.failed", actorId: s.id } })).toBe(LIMITS.user.max);
    expect(await db.auditEvent.count({ where: { action: "code.lookup.locked", actorId: s.id } })).toBe(1);
  });

  it("garbage input is a validation error, not a counted attempt", async () => {
    const s = await makeUser();
    await expect(lookupCode(s, "  ", meta())).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.codeLookupLimit.count()).toBe(0);
  });
});
