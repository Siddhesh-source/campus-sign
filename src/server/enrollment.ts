import "server-only";
import { db } from "./db";
import { audit, type RequestMeta } from "./audit";
import { UserFacingError } from "./errors";
import { checkLimit, clearFailures, recordFailure } from "./rate-limit";
import { codeState, toLookupKey } from "./classes";
import type { CurrentUser } from "./auth";

const INVALID_CODE = "That code doesn't match an open class. Check it with your faculty.";

function lockedMessage(retryAt: Date) {
  const mins = Math.max(1, Math.ceil((retryAt.getTime() - Date.now()) / 60_000));
  return `Too many wrong codes. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

/**
 * Rate limits and validates a raw code. Every non-match (unknown, expired,
 * revoked, superseded, archived class) produces the same response.
 */
async function resolveCode(actor: CurrentUser, raw: string, meta: RequestMeta) {
  const key = toLookupKey(raw ?? "");
  if (key.length < 6 || key.length > 20) {
    throw new UserFacingError("VALIDATION", "Enter the full code, like VIT-CS26-K7P9Q.", { code: "Enter the full code." });
  }

  const ip = meta.ip ?? "unknown";
  for (const [kind, id] of [["user", actor.id], ["ip", ip]] as const) {
    const state = await checkLimit(kind, id);
    if (state.locked) throw new UserFacingError("RATE_LIMITED", lockedMessage(state.retryAt));
  }

  const code = await db.classCode.findUnique({
    where: { lookupKey: key },
    include: {
      class: {
        include: {
          faculty: { select: { id: true, name: true, email: true, image: true } },
          _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
        },
      },
    },
  });

  if (!code || codeState(code) !== "ACTIVE" || code.class.archivedAt) {
    const userResult = await recordFailure("user", actor.id);
    const ipResult = await recordFailure("ip", ip);
    const lockedUntil = userResult.lockedUntil ?? ipResult.lockedUntil;
    await db.$transaction(async (tx) => {
      await audit(tx, { actor, action: "code.lookup.failed", metadata: { attempted: key.slice(0, 20) }, meta });
      if (lockedUntil) {
        await audit(tx, { actor, action: "code.lookup.locked", metadata: { until: lockedUntil.toISOString() }, meta });
      }
    });
    if (lockedUntil) throw new UserFacingError("RATE_LIMITED", lockedMessage(lockedUntil));
    const left = userResult.remaining;
    throw new UserFacingError(
      "CODE_INVALID",
      left <= 3 ? `${INVALID_CODE} ${left} attempt${left === 1 ? "" : "s"} left before a short pause.` : INVALID_CODE,
    );
  }

  await clearFailures("user", actor.id);
  return code;
}

async function facultyIsVerified(email: string) {
  const access = await db.facultyAccess.findUnique({ where: { email }, select: { status: true } });
  return access?.status === "APPROVED";
}

export type ClassPreview = {
  code: string;
  classId: string;
  name: string;
  subjectCode: string;
  academicYear: string;
  yearOfStudy: string;
  division: string;
  description: string | null;
  faculty: { name: string; email: string; verified: boolean };
  enrolled: number;
  studentLimit: number;
  expiresAt: Date | null;
  membership: "NONE" | "ACTIVE" | "REMOVED" | "LEFT";
};

export async function lookupCode(actor: CurrentUser, raw: string, meta: RequestMeta): Promise<ClassPreview> {
  const code = await resolveCode(actor, raw, meta);
  const existing = await db.enrollment.findUnique({
    where: { classId_studentId: { classId: code.classId, studentId: actor.id } },
    select: { status: true },
  });
  const cls = code.class;
  return {
    code: code.code,
    classId: cls.id,
    name: cls.name,
    subjectCode: cls.subjectCode,
    academicYear: cls.academicYear,
    yearOfStudy: cls.yearOfStudy,
    division: cls.division,
    description: cls.description,
    faculty: { name: cls.faculty.name, email: cls.faculty.email, verified: await facultyIsVerified(cls.faculty.email) },
    enrolled: cls._count.enrollments,
    studentLimit: cls.studentLimit,
    expiresAt: code.expiresAt,
    membership: existing?.status ?? "NONE",
  };
}

/**
 * Students are approved automatically. The class row is locked so two
 * students racing for the last seat can't both get in.
 */
export async function joinClass(actor: CurrentUser, raw: string, meta: RequestMeta) {
  const code = await resolveCode(actor, raw, meta);

  return db.$transaction(async (tx) => {
    const [cls] = await tx.$queryRaw<{ id: string; studentLimit: number; archivedAt: Date | null }[]>`
      SELECT "id","studentLimit","archivedAt" FROM "class" WHERE "id" = ${code.classId} FOR UPDATE`;

    // Re-check inside the lock: the code may have been rotated/revoked since lookup.
    const fresh = await tx.classCode.findUnique({ where: { id: code.id } });
    if (!cls || cls.archivedAt || !fresh || codeState(fresh) !== "ACTIVE") {
      throw new UserFacingError("CODE_INVALID", "This code just stopped working. Ask your faculty for the current one.");
    }

    const existing = await tx.enrollment.findUnique({
      where: { classId_studentId: { classId: cls.id, studentId: actor.id } },
    });
    if (existing?.status === "ACTIVE") throw new UserFacingError("ALREADY_ENROLLED", "You're already in this class.");
    if (existing?.status === "REMOVED") {
      throw new UserFacingError("FORBIDDEN", "Your faculty removed you from this class. Talk to them if that's a mistake.");
    }

    const active = await tx.enrollment.count({ where: { classId: cls.id, status: "ACTIVE" } });
    if (active >= cls.studentLimit) throw new UserFacingError("CLASS_FULL", "This class is full. Ask your faculty to raise the seat limit.");

    const enrollment = existing
      ? await tx.enrollment.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", joinedAt: new Date(), endedAt: null, viaCodeId: fresh.id },
        })
      : await tx.enrollment.create({ data: { classId: cls.id, studentId: actor.id, viaCodeId: fresh.id } });

    await audit(tx, {
      actor,
      action: "enrollment.join",
      targetType: "enrollment",
      targetId: enrollment.id,
      metadata: { classId: cls.id, code: fresh.code },
      meta,
    });
    return { enrollmentId: enrollment.id, classId: cls.id, joinedAt: enrollment.joinedAt };
  });
}

export async function leaveClass(actor: CurrentUser, enrollmentId: string, meta: RequestMeta) {
  return db.$transaction(async (tx) => {
    const res = await tx.enrollment.updateMany({
      where: { id: enrollmentId, studentId: actor.id, status: "ACTIVE" },
      data: { status: "LEFT", endedAt: new Date() },
    });
    if (res.count === 0) throw new UserFacingError("STALE", "You're not in that class anymore.");
    await audit(tx, { actor, action: "enrollment.leave", targetType: "enrollment", targetId: enrollmentId, meta });
  });
}

export async function getStudentClasses(studentId: string) {
  const rows = await db.enrollment.findMany({
    where: { studentId, status: "ACTIVE" },
    orderBy: { joinedAt: "desc" },
    include: {
      class: {
        include: { faculty: { select: { name: true, email: true } } },
      },
    },
  });
  return rows.map((e) => ({
    enrollmentId: e.id,
    joinedAt: e.joinedAt,
    classId: e.class.id,
    name: e.class.name,
    subjectCode: e.class.subjectCode,
    academicYear: e.class.academicYear,
    yearOfStudy: e.class.yearOfStudy,
    division: e.class.division,
    faculty: e.class.faculty,
  }));
}
