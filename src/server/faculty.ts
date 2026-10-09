import "server-only";
import { z } from "zod";
import { db } from "./db";
import { audit, type RequestMeta } from "./audit";
import { UserFacingError } from "./errors";
import { isInstitutionEmail, normalizeEmail } from "@/lib/identity";
import type { CurrentUser } from "./auth";

const department = z.string().trim().max(80, "Keep it under 80 characters.").optional().or(z.literal(""));

/** A signed-in VIT user asks to be verified as faculty. An admin decides. */
export async function requestFacultyAccess(actor: CurrentUser, input: { department?: string }, meta: RequestMeta) {
  const dept = department.safeParse(input.department);
  if (!dept.success) throw new UserFacingError("VALIDATION", dept.error.issues[0].message, { department: dept.error.issues[0].message });
  if (actor.role !== "STUDENT") throw new UserFacingError("STALE", "Your account already has staff access.");

  return db.$transaction(async (tx) => {
    const existing = await tx.facultyAccess.findUnique({ where: { email: actor.email } });
    if (existing?.status === "PENDING") throw new UserFacingError("STALE", "Your request is already with the admin.");
    if (existing?.status === "APPROVED") throw new UserFacingError("STALE", "You're already verified as faculty.");
    await tx.facultyAccess.upsert({
      where: { email: actor.email },
      create: { email: actor.email, department: dept.data || null, status: "PENDING", requestedAt: new Date() },
      update: { department: dept.data || null, status: "PENDING", requestedAt: new Date(), decidedAt: null, decidedById: null },
    });
    await audit(tx, { actor, action: "faculty.request", targetType: "faculty_access", targetId: actor.email, meta });
  });
}

type Decision = "approve" | "reject" | "revoke";
const transitions: Record<Decision, { from: ("PENDING" | "APPROVED" | "REJECTED" | "REVOKED")[]; to: "APPROVED" | "REJECTED" | "REVOKED"; action: "faculty.approve" | "faculty.reject" | "faculty.revoke" }> = {
  approve: { from: ["PENDING", "REJECTED", "REVOKED"], to: "APPROVED", action: "faculty.approve" },
  reject: { from: ["PENDING"], to: "REJECTED", action: "faculty.reject" },
  revoke: { from: ["APPROVED"], to: "REVOKED", action: "faculty.revoke" },
};

export async function decideFacultyAccess(admin: CurrentUser, id: string, decision: Decision, meta: RequestMeta) {
  const t = transitions[decision];
  return db.$transaction(async (tx) => {
    const res = await tx.facultyAccess.updateMany({
      where: { id, status: { in: t.from } },
      data: { status: t.to, decidedAt: new Date(), decidedById: admin.id },
    });
    if (res.count === 0) throw new UserFacingError("STALE", "Someone already changed this request. Refresh to see the latest.");
    const row = await tx.facultyAccess.findUniqueOrThrow({ where: { id } });
    await audit(tx, { actor: admin, action: t.action, targetType: "faculty_access", targetId: row.email, meta });
  });
}

const addSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  department: department,
});

/** Admin pre-approves a faculty email; it applies at that person's next request. */
export async function addFacultyEmail(admin: CurrentUser, input: unknown, meta: RequestMeta) {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0].message;
    throw new UserFacingError("VALIDATION", msg, { [String(parsed.error.issues[0].path[0])]: msg });
  }
  const email = normalizeEmail(parsed.data.email);
  if (!isInstitutionEmail(email)) throw new UserFacingError("VALIDATION", "Faculty must use an @vit.edu email.", { email: "Use an @vit.edu email." });

  return db.$transaction(async (tx) => {
    const existing = await tx.facultyAccess.findUnique({ where: { email } });
    if (existing?.status === "APPROVED") throw new UserFacingError("STALE", `${email} is already verified.`);
    await tx.facultyAccess.upsert({
      where: { email },
      create: { email, department: parsed.data.department || null, status: "APPROVED", decidedAt: new Date(), decidedById: admin.id },
      update: { department: parsed.data.department || existing?.department || null, status: "APPROVED", decidedAt: new Date(), decidedById: admin.id },
    });
    await audit(tx, { actor: admin, action: "faculty.add", targetType: "faculty_access", targetId: email, meta });
  });
}

export async function listFacultyAccess() {
  const rows = await db.facultyAccess.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
  const users = await db.user.findMany({
    where: { email: { in: rows.map((r) => r.email) } },
    select: { email: true, name: true, createdAt: true },
  });
  const byEmail = new Map(users.map((u) => [u.email, u]));
  return rows.map((r) => ({ ...r, user: byEmail.get(r.email) ?? null }));
}

export async function listAuditEvents(filter: { q?: string; cursor?: string }, take = 50) {
  const q = filter.q?.trim();
  return db.auditEvent.findMany({
    where: q
      ? { OR: [{ actorEmail: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }, { targetId: { contains: q } }] }
      : undefined,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
  });
}
