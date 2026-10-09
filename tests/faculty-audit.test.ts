import { describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { addFacultyEmail, decideFacultyAccess, requestFacultyAccess } from "@/server/faculty";
import { makeUser, meta } from "./helpers";

describe("faculty access", () => {
  it("request → approve, with stale double-decisions rejected", async () => {
    const admin = await makeUser("ADMIN");
    const u = await makeUser("STUDENT");
    await requestFacultyAccess(u, { department: "Computer Engineering" }, meta());
    await expect(requestFacultyAccess(u, {}, meta())).rejects.toMatchObject({ code: "STALE" });

    const row = await db.facultyAccess.findUniqueOrThrow({ where: { email: u.email } });
    await decideFacultyAccess(admin, row.id, "approve", meta());
    await expect(decideFacultyAccess(admin, row.id, "reject", meta())).rejects.toMatchObject({ code: "STALE" });
    expect((await db.facultyAccess.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("APPROVED");

    const actions = (await db.auditEvent.findMany({ orderBy: { createdAt: "asc" } })).map((e) => e.action);
    expect(actions).toEqual(["faculty.request", "faculty.approve"]);
  });

  it("admin can pre-approve only @vit.edu emails", async () => {
    const admin = await makeUser("ADMIN");
    await expect(addFacultyEmail(admin, { email: "prof@gmail.com" }, meta())).rejects.toMatchObject({ code: "VALIDATION" });
    await addFacultyEmail(admin, { email: "New.Prof@VIT.edu" }, meta());
    expect((await db.facultyAccess.findUniqueOrThrow({ where: { email: "new.prof@vit.edu" } })).status).toBe("APPROVED");
  });
});

describe("audit log", () => {
  it("is append-only at the database level", async () => {
    const e = await db.auditEvent.create({ data: { action: "auth.sign_in", actorEmail: "x@vit.edu" } });
    await expect(db.auditEvent.update({ where: { id: e.id }, data: { action: "tampered" } })).rejects.toThrow(/append-only/);
    await expect(db.auditEvent.delete({ where: { id: e.id } })).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe('TRUNCATE "audit_event"')).rejects.toThrow(/append-only/);
    expect((await db.auditEvent.findUniqueOrThrow({ where: { id: e.id } })).action).toBe("auth.sign_in");
  });
});
