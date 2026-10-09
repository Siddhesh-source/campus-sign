import "server-only";
import { randomInt } from "node:crypto";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "./db";
import { audit, type RequestMeta } from "./audit";
import { UserFacingError } from "./errors";
import type { CurrentUser } from "./auth";
import { CODE_ALPHABET, CODE_SECRET_LENGTH, EXPIRY_OPTIONS, YEARS_OF_STUDY, codePrefix, toLookupKey, type ExpiryOption } from "@/lib/codes";

export { codePrefix, toLookupKey };

// ── Codes ─────────────────────────────────────────────────────────────────

export function generateCode(prefix: string, rand: (max: number) => number = randomInt) {
  let secret = "";
  for (let i = 0; i < CODE_SECRET_LENGTH; i++) secret += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return `${prefix}-${secret}`;
}

export type CodeState = "ACTIVE" | "EXPIRED" | "REVOKED" | "SUPERSEDED";

export function codeState(code: { status: CodeState | "ACTIVE" | "REVOKED" | "SUPERSEDED"; expiresAt: Date | null }, now = new Date()): CodeState {
  if (code.status === "ACTIVE" && code.expiresAt && code.expiresAt <= now) return "EXPIRED";
  return code.status;
}

async function issueCode(
  tx: Tx,
  cls: { id: string; subjectCode: string; academicYear: string },
  createdById: string,
  expiresAt: Date | null,
) {
  const prefix = codePrefix(cls.subjectCode, cls.academicYear);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode(prefix);
    try {
      // Savepoint so a collision doesn't abort the surrounding transaction.
      await tx.$executeRaw`SAVEPOINT issue_code`;
      const row = await tx.classCode.create({
        data: { classId: cls.id, code, lookupKey: toLookupKey(code), expiresAt, createdById },
      });
      await tx.$executeRaw`RELEASE SAVEPOINT issue_code`;
      return row;
    } catch (err) {
      await tx.$executeRaw`ROLLBACK TO SAVEPOINT issue_code`;
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }
  throw new Error("Could not generate a unique class code after 5 attempts");
}

// ── Validation ────────────────────────────────────────────────────────────

export function expiryFromOption(option: ExpiryOption, now = new Date()) {
  if (option === "never") return null;
  return new Date(now.getTime() + Number(option) * 24 * 60 * 60_000);
}

export const createClassSchema = z
  .object({
    name: z.string().trim().min(3, "Use at least 3 characters.").max(120, "Keep it under 120 characters."),
    subjectCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2,6}[A-Za-z0-9-]{0,8}$/, "Use letters then numbers, like CS2101."),
    academicYear: z
      .string()
      .regex(/^20\d{2}-\d{2}$/, "Use the format 2026-27.")
      .refine((v) => (Number(v.slice(2, 4)) + 1) % 100 === Number(v.slice(5, 7)), "The two years must be consecutive."),
    yearOfStudy: z.enum(YEARS_OF_STUDY, { message: "Pick FY, SY, TY or LY." }),
    division: z.string().trim().regex(/^[A-Za-z0-9]{1,3}$/, "Use 1–3 letters or numbers, like B."),
    description: z.string().trim().max(500, "Keep it under 500 characters.").optional().or(z.literal("")),
    studentLimit: z.coerce.number().int("Use a whole number.").min(1, "At least 1 seat.").max(500, "At most 500 seats."),
    codeExpiry: z.enum(EXPIRY_OPTIONS),
  })
  .transform((v) => ({
    ...v,
    subjectCode: v.subjectCode.toUpperCase(),
    division: v.division.toUpperCase(),
    description: v.description || null,
  }));

export type CreateClassInput = z.input<typeof createClassSchema>;

export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] ??= issue.message;
    }
    throw new UserFacingError("VALIDATION", "Check the highlighted fields.", fieldErrors);
  }
  return parsed.data;
}

// ── Mutations (faculty) ───────────────────────────────────────────────────

export async function createClass(actor: CurrentUser, input: unknown, meta: RequestMeta) {
  const data = parseOrThrow(createClassSchema, input);
  return db.$transaction(async (tx) => {
    const cls = await tx.class.create({
      data: {
        facultyId: actor.id,
        name: data.name,
        subjectCode: data.subjectCode,
        academicYear: data.academicYear,
        yearOfStudy: data.yearOfStudy,
        division: data.division,
        description: data.description,
        studentLimit: data.studentLimit,
      },
    });
    const code = await issueCode(tx, cls, actor.id, expiryFromOption(data.codeExpiry));
    await audit(tx, {
      actor,
      action: "class.create",
      targetType: "class",
      targetId: cls.id,
      metadata: { name: cls.name, code: code.code, studentLimit: cls.studentLimit },
      meta,
    });
    return { classId: cls.id, code: code.code };
  });
}

/** Lock the class row and verify ownership. Non-owners get NOT_FOUND (no existence leak). */
async function lockOwnedClass(tx: Tx, classId: string, actor: CurrentUser) {
  const rows = await tx.$queryRaw<{ id: string; facultyId: string; subjectCode: string; academicYear: string; studentLimit: number }[]>`
    SELECT "id","facultyId","subjectCode","academicYear","studentLimit" FROM "class"
    WHERE "id" = ${classId} AND "archivedAt" IS NULL FOR UPDATE`;
  const cls = rows[0];
  if (!cls || cls.facultyId !== actor.id) throw new UserFacingError("NOT_FOUND", "That class doesn't exist or isn't yours.");
  return cls;
}

/** Retire the current code (if any) and issue a new one. The old code stops working immediately. */
export async function rotateCode(actor: CurrentUser, classId: string, meta: RequestMeta) {
  return db.$transaction(async (tx) => {
    const cls = await lockOwnedClass(tx, classId, actor);
    const now = new Date();
    const current = await tx.classCode.findFirst({ where: { classId, status: "ACTIVE" } });
    let expiresAt: Date | null = null;
    if (current) {
      await tx.classCode.update({ where: { id: current.id }, data: { status: "SUPERSEDED", endedAt: now } });
      // Keep the same validity window the faculty chose originally.
      if (current.expiresAt) expiresAt = new Date(now.getTime() + (current.expiresAt.getTime() - current.createdAt.getTime()));
    } else {
      expiresAt = expiryFromOption("7", now);
    }
    const next = await issueCode(tx, cls, actor.id, expiresAt);
    await audit(tx, {
      actor,
      action: "class.code.rotate",
      targetType: "class",
      targetId: classId,
      metadata: { from: current?.code ?? null, to: next.code },
      meta,
    });
    return { code: next.code };
  });
}

export async function revokeCode(actor: CurrentUser, classId: string, meta: RequestMeta) {
  return db.$transaction(async (tx) => {
    await lockOwnedClass(tx, classId, actor);
    const current = await tx.classCode.findFirst({ where: { classId, status: "ACTIVE" } });
    if (!current) throw new UserFacingError("STALE", "This class has no active code to revoke.");
    await tx.classCode.update({ where: { id: current.id }, data: { status: "REVOKED", endedAt: new Date() } });
    await audit(tx, { actor, action: "class.code.revoke", targetType: "class", targetId: classId, metadata: { code: current.code }, meta });
  });
}

export async function setCodeExpiry(actor: CurrentUser, classId: string, option: unknown, meta: RequestMeta) {
  const parsed = z.enum([...EXPIRY_OPTIONS, "now"]).safeParse(option);
  if (!parsed.success) throw new UserFacingError("VALIDATION", "Pick an expiry option.");
  return db.$transaction(async (tx) => {
    await lockOwnedClass(tx, classId, actor);
    const current = await tx.classCode.findFirst({ where: { classId, status: "ACTIVE" } });
    if (!current) throw new UserFacingError("STALE", "This class has no active code. Issue a new one first.");
    const expiresAt = parsed.data === "now" ? new Date() : expiryFromOption(parsed.data);
    await tx.classCode.update({ where: { id: current.id }, data: { expiresAt } });
    await audit(tx, {
      actor,
      action: "class.code.expiry",
      targetType: "class",
      targetId: classId,
      metadata: { code: current.code, expiresAt: expiresAt?.toISOString() ?? null },
      meta,
    });
  });
}

export async function removeStudent(actor: CurrentUser, classId: string, enrollmentId: string, meta: RequestMeta) {
  return db.$transaction(async (tx) => {
    await lockOwnedClass(tx, classId, actor);
    const res = await tx.enrollment.updateMany({
      where: { id: enrollmentId, classId, status: "ACTIVE" },
      data: { status: "REMOVED", endedAt: new Date() },
    });
    if (res.count === 0) throw new UserFacingError("STALE", "That student is no longer enrolled.");
    await audit(tx, { actor, action: "class.student.remove", targetType: "enrollment", targetId: enrollmentId, metadata: { classId }, meta });
  });
}

// ── Queries (faculty) ─────────────────────────────────────────────────────

export async function getFacultyClasses(facultyId: string, now = new Date()) {
  const weekFromNow = now.getTime() + 7 * 24 * 60 * 60_000;
  const classes = await db.class.findMany({
    where: { facultyId, archivedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      codes: { where: { status: "ACTIVE" }, take: 1 },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    subjectCode: c.subjectCode,
    academicYear: c.academicYear,
    yearOfStudy: c.yearOfStudy,
    division: c.division,
    studentLimit: c.studentLimit,
    enrolled: c._count.enrollments,
    code: c.codes[0]
      ? {
          code: c.codes[0].code,
          expiresAt: c.codes[0].expiresAt,
          state: codeState(c.codes[0], now),
          expiresSoon: codeState(c.codes[0], now) === "ACTIVE" && !!c.codes[0].expiresAt && c.codes[0].expiresAt.getTime() < weekFromNow,
        }
      : null,
  }));
}

export async function getClassDetail(classId: string, facultyId: string) {
  const cls = await db.class.findFirst({
    where: { id: classId, facultyId, archivedAt: null },
    include: {
      codes: { orderBy: { createdAt: "desc" }, take: 6 },
      enrollments: {
        where: { status: "ACTIVE" },
        orderBy: { joinedAt: "desc" },
        include: { student: { select: { id: true, name: true, email: true } } },
      },
    },
  });
  if (!cls) return null;
  const active = cls.codes.find((c) => c.status === "ACTIVE") ?? null;
  return {
    ...cls,
    activeCode: active ? { ...active, state: codeState(active) } : null,
    codeHistory: cls.codes.map((c) => ({ ...c, state: codeState(c) })),
  };
}
