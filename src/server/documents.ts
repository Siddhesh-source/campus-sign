import "server-only";
import { z } from "zod";
import type { DocumentStatus, Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "./db";
import { audit, type RequestMeta } from "./audit";
import { UserFacingError } from "./errors";
import { inspectPdf } from "./pdf";
import { putFile } from "./storage";
import { enqueueLedgerEvent } from "./ledger/outbox";
import type { CurrentUser } from "./auth";
import { currentStepOf, isCurrentApprover, reachedApprovers, routeForType } from "./routes";

/** Statuses in which the student may upload a new version. */
const EDITABLE: DocumentStatus[] = ["DRAFT", "CORRECTIONS_REQUESTED"];
/** Statuses in which the faculty may record a decision. */
export const DECIDABLE: DocumentStatus[] = ["SUBMITTED", "PENDING_REVIEW"];

const notFound = () => new UserFacingError("NOT_FOUND", "That document doesn't exist or you can't see it.");

export async function listDocumentTypes() {
  return db.documentType.findMany({ where: { active: true }, orderBy: { name: "asc" } });
}

// ── Access ────────────────────────────────────────────────────────────────

/**
 * The single access rule: the owning student; the faculty who owns the class;
 * or a designated route approver once the document has reached their step.
 * Everyone else (other students, other faculty, admins) gets NOT_FOUND so
 * existence isn't leaked.
 */
export function canView(actor: CurrentUser, doc: { studentId: string; approverEmails?: string[]; class: { facultyId: string } }) {
  if (actor.role === "STUDENT") return doc.studentId === actor.id;
  if (actor.role === "FACULTY") return doc.class.facultyId === actor.id || (doc.approverEmails ?? []).includes(actor.email);
  return false;
}

async function lockDocument(tx: Tx, id: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "document" WHERE "id" = ${id} FOR UPDATE`;
  if (!rows[0]) throw notFound();
  return tx.document.findUniqueOrThrow({
    where: { id },
    include: { class: true, type: true, current: true },
  });
}

async function requireActiveEnrollment(tx: Tx | typeof db, studentId: string, classId: string) {
  const e = await tx.enrollment.findUnique({ where: { classId_studentId: { classId, studentId } }, select: { status: true } });
  if (e?.status !== "ACTIVE") throw new UserFacingError("FORBIDDEN", "You need to be enrolled in this class to submit documents to it.");
}

// ── Student mutations ─────────────────────────────────────────────────────

const createSchema = z.object({
  classId: z.string().min(1, "Pick a class."),
  typeId: z.string().min(1, "Pick a document type."),
  title: z.string().trim().min(3, "Use at least 3 characters.").max(140, "Keep it under 140 characters."),
});

export type UploadedFile = { bytes: Uint8Array; name: string };

export async function createDocument(actor: CurrentUser, input: unknown, file: UploadedFile, meta: RequestMeta) {
  if (actor.role !== "STUDENT") throw new UserFacingError("FORBIDDEN", "Only students submit documents.");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const i of parsed.error.issues) fieldErrors[String(i.path[0])] ??= i.message;
    throw new UserFacingError("VALIDATION", "Check the highlighted fields.", fieldErrors);
  }
  const { classId, typeId, title } = parsed.data;
  await requireActiveEnrollment(db, actor.id, classId);
  const type = await db.documentType.findFirst({ where: { id: typeId, active: true } });
  if (!type) throw new UserFacingError("VALIDATION", "Pick a document type.", { typeId: "Pick a document type." });

  const pdf = await inspectPdf(file.bytes);
  const storageKey = await putFile(file.bytes);

  return db.$transaction(async (tx) => {
    const doc = await tx.document.create({ data: { classId, studentId: actor.id, typeId, title } });
    const version = await tx.documentVersion.create({
      data: {
        documentId: doc.id,
        number: 1,
        storageKey,
        sha256: pdf.sha256,
        sizeBytes: file.bytes.byteLength,
        pageCount: pdf.pageCount,
        originalName: file.name.slice(0, 200),
        uploadedById: actor.id,
      },
    });
    await tx.document.update({ where: { id: doc.id }, data: { currentVersionId: version.id } });
    await tx.documentEvent.createMany({
      data: [
        { documentId: doc.id, actorId: actor.id, actorRole: "STUDENT", type: "CREATED" },
        { documentId: doc.id, versionId: version.id, actorId: actor.id, actorRole: "STUDENT", type: "VERSION_UPLOADED" },
      ],
    });
    await audit(tx, { actor, action: "document.create", targetType: "document", targetId: doc.id, metadata: { classId, sha256: pdf.sha256 }, meta });
    return { documentId: doc.id, versionId: version.id, sha256: pdf.sha256 };
  });
}

/** Never replaces a version: each upload is a new numbered, hashed record. */
export async function addVersion(actor: CurrentUser, documentId: string, file: UploadedFile, meta: RequestMeta) {
  const pdf = await inspectPdf(file.bytes);
  const pre = await db.document.findUnique({ where: { id: documentId }, include: { class: true } });
  if (!pre || !canView(actor, pre) || actor.role !== "STUDENT") throw notFound();
  if (!EDITABLE.includes(pre.status)) {
    throw new UserFacingError("STALE", "This version is locked while it's with your faculty. You can upload a new one if they ask for corrections.");
  }
  const storageKey = await putFile(file.bytes);

  return db.$transaction(async (tx) => {
    const doc = await lockDocument(tx, documentId);
    if (!EDITABLE.includes(doc.status)) throw new UserFacingError("STALE", "This document was just submitted. Refresh to see the latest.");
    await requireActiveEnrollment(tx, actor.id, doc.classId);
    const last = await tx.documentVersion.aggregate({ where: { documentId }, _max: { number: true } });
    const version = await tx.documentVersion.create({
      data: {
        documentId,
        number: (last._max.number ?? 0) + 1,
        storageKey,
        sha256: pdf.sha256,
        sizeBytes: file.bytes.byteLength,
        pageCount: pdf.pageCount,
        originalName: file.name.slice(0, 200),
        uploadedById: actor.id,
      },
    });
    await tx.document.update({ where: { id: documentId }, data: { currentVersionId: version.id, status: "DRAFT" } });
    await tx.documentEvent.create({
      data: { documentId, versionId: version.id, actorId: actor.id, actorRole: "STUDENT", type: "VERSION_UPLOADED" },
    });
    await audit(tx, { actor, action: "document.version", targetType: "document", targetId: documentId, metadata: { number: version.number, sha256: pdf.sha256 }, meta });
    return { versionId: version.id, number: version.number, sha256: pdf.sha256 };
  });
}

export async function submitDocument(actor: CurrentUser, documentId: string, versionId: string, meta: RequestMeta) {
  return db.$transaction(async (tx) => {
    const doc = await lockDocument(tx, documentId);
    if (!canView(actor, doc) || actor.role !== "STUDENT") throw notFound();
    if (doc.status !== "DRAFT") throw new UserFacingError("STALE", "This document has already been submitted.");
    if (doc.currentVersionId !== versionId) throw new UserFacingError("STALE", "A newer version exists. Review it before submitting.");
    await requireActiveEnrollment(tx, actor.id, doc.classId);
    const now = new Date();
    // Freeze the approval route; every (re)submission starts again at step 1.
    const route = await routeForType(tx, doc.typeId);
    await tx.documentVersion.update({ where: { id: versionId }, data: { submittedAt: now } });
    await tx.document.update({
      where: { id: documentId },
      data: {
        status: "SUBMITTED",
        submittedAt: now,
        routeSnapshot: route,
        currentStep: 1,
        approverEmails: { set: [...new Set([...doc.approverEmails, ...reachedApprovers(route, 1)])] },
      },
    });
    await tx.documentEvent.create({ data: { documentId, versionId, actorId: actor.id, actorRole: "STUDENT", type: "SUBMITTED" } });
    await enqueueLedgerEvent(tx, {
      type: "SUBMITTED",
      documentRef: documentId,
      versionId,
      versionNumber: doc.current!.number,
      sha256: doc.current!.sha256,
      occurredAt: now,
    });
    await audit(tx, { actor, action: "document.submit", targetType: "document", targetId: documentId, metadata: { versionId, sha256: doc.current?.sha256 ?? null }, meta });
  });
}

// ── Faculty mutations ─────────────────────────────────────────────────────

/** Idempotent: the first time the class faculty opens a submitted document. */
export async function startReview(actor: CurrentUser, documentId: string, meta: RequestMeta) {
  return db.$transaction(async (tx) => {
    const doc = await lockDocument(tx, documentId);
    if (!canView(actor, doc) || actor.role !== "FACULTY") throw notFound();
    if (doc.status !== "SUBMITTED" || !isCurrentApprover(actor, doc)) return;
    await tx.document.update({ where: { id: documentId }, data: { status: "PENDING_REVIEW" } });
    await tx.documentEvent.create({
      data: { documentId, versionId: doc.currentVersionId, actorId: actor.id, actorRole: "FACULTY", type: "REVIEW_STARTED", step: doc.currentStep },
    });
    await audit(tx, { actor, action: "document.review_start", targetType: "document", targetId: documentId, meta });
  });
}

const decisionSchema = z.object({
  versionId: z.string().min(1),
  decision: z.enum(["REJECT", "REQUEST_CORRECTIONS"]),
  reason: z.string().trim().min(10, "Give the student at least a sentence (10+ characters).").max(1000, "Keep it under 1000 characters."),
});

/**
 * Reject or request corrections. The decision names the exact version it was
 * made on; if that's no longer current, it's refused as stale.
 */
export async function decideDocument(actor: CurrentUser, documentId: string, input: unknown, meta: RequestMeta) {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) {
    const msg = parsed.error.issues[0].message;
    throw new UserFacingError("VALIDATION", msg, { reason: msg });
  }
  const { versionId, decision, reason } = parsed.data;
  return db.$transaction(async (tx) => {
    const doc = await lockDocument(tx, documentId);
    if (!canView(actor, doc) || actor.role !== "FACULTY") throw notFound();
    assertDecidable(doc, versionId);
    assertCurrentApprover(actor, doc);
    const status: DocumentStatus = decision === "REJECT" ? "REJECTED" : "CORRECTIONS_REQUESTED";
    await tx.document.update({ where: { id: documentId }, data: { status } });
    await tx.documentEvent.create({
      data: {
        documentId,
        versionId,
        actorId: actor.id,
        actorRole: "FACULTY",
        type: decision === "REJECT" ? "REJECTED" : "CORRECTIONS_REQUESTED",
        step: doc.currentStep,
        reason,
      },
    });
    // On-chain: the event and the exact version only. The reason never leaves Postgres.
    await enqueueLedgerEvent(tx, {
      type: decision === "REJECT" ? "REJECTED" : "CORRECTIONS_REQUESTED",
      documentRef: documentId,
      versionId,
      versionNumber: doc.current!.number,
      sha256: doc.current!.sha256,
    });
    await audit(tx, {
      actor,
      action: decision === "REJECT" ? "document.reject" : "document.request_corrections",
      targetType: "document",
      targetId: documentId,
      metadata: { versionId },
      meta,
    });
  });
}

/** Only the approver of the current route step may decide or sign. */
export function assertCurrentApprover(actor: CurrentUser, doc: Parameters<typeof isCurrentApprover>[1]) {
  if (!isCurrentApprover(actor, doc)) {
    const step = currentStepOf(doc);
    throw new UserFacingError("FORBIDDEN", `This document is waiting for ${step.label}. Only that approver can decide at this step.`);
  }
}

export function assertDecidable(doc: { status: DocumentStatus; currentVersionId: string | null }, versionId: string) {
  if (!DECIDABLE.includes(doc.status)) throw new UserFacingError("STALE", "A decision was already recorded for this document.");
  if (doc.currentVersionId !== versionId) throw new UserFacingError("STALE", "This isn't the version you reviewed anymore. Reload to see the latest.");
}

// ── Queries ───────────────────────────────────────────────────────────────

const detailInclude = {
  class: { include: { faculty: { select: { id: true, name: true, email: true } } } },
  type: true,
  student: { select: { id: true, name: true, email: true } },
  versions: { orderBy: { number: "desc" } },
  events: { orderBy: { createdAt: "asc" } },
  signatures: {
    orderBy: { signedAt: "desc" },
    select: { id: true, code: true, signedAt: true, signedSha256: true, versionId: true, stepOrder: true, totalSteps: true, credential: { select: { faculty: { select: { name: true } } } } },
  },
} satisfies Prisma.DocumentInclude;

export type DocumentDetail = Prisma.DocumentGetPayload<{ include: typeof detailInclude }> & {
  actorNames: Record<string, string>;
};

export async function getDocument(actor: CurrentUser, id: string): Promise<DocumentDetail | null> {
  const doc = await db.document.findUnique({ where: { id }, include: detailInclude });
  if (!doc || !canView(actor, doc)) return null;
  const actorIds = [...new Set(doc.events.map((e) => e.actorId))];
  const users = await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  return { ...doc, actorNames: Object.fromEntries(users.map((u) => [u.id, u.name])) };
}

/** For the file route: returns the storage key only if the actor may see this version. */
export async function getVersionFile(actor: CurrentUser, versionId: string) {
  const v = await db.documentVersion.findUnique({
    where: { id: versionId },
    include: { document: { include: { class: { select: { facultyId: true } } } } },
  });
  if (!v || !canView(actor, v.document)) return null;
  // Faculty only ever see what a student actually submitted.
  if (actor.role === "FACULTY" && !v.submittedAt) return null;
  return { storageKey: v.storageKey, name: v.originalName, sha256: v.sha256 };
}

export async function listStudentDocuments(studentId: string) {
  return db.document.findMany({
    where: { studentId },
    orderBy: { updatedAt: "desc" },
    include: { class: { select: { name: true, division: true, yearOfStudy: true } }, type: true, current: { select: { number: true } } },
  });
}

export const INBOX_SORTS = ["newest", "oldest", "class", "status"] as const;
export type InboxFilter = { status?: string; classId?: string; typeId?: string; sort?: string };

export async function listInbox(faculty: { id: string; email: string }, f: InboxFilter) {
  const facultyId = faculty.id;
  const visible: DocumentStatus[] = ["SUBMITTED", "PENDING_REVIEW", "APPROVED", "CORRECTIONS_REQUESTED", "REJECTED"];
  const status = visible.includes(f.status as DocumentStatus) ? (f.status as DocumentStatus) : undefined;
  const orderBy: Prisma.DocumentOrderByWithRelationInput[] =
    f.sort === "oldest"
      ? [{ submittedAt: "asc" }]
      : f.sort === "class"
        ? [{ class: { name: "asc" } }, { submittedAt: "desc" }]
        : f.sort === "status"
          ? [{ status: "asc" }, { submittedAt: "desc" }]
          : [{ submittedAt: "desc" }];
  return db.document.findMany({
    where: {
      OR: [{ class: { facultyId } }, { approverEmails: { has: faculty.email } }],
      status: status ? status : { in: visible },
      ...(f.classId ? { classId: f.classId } : {}),
      ...(f.typeId ? { typeId: f.typeId } : {}),
    },
    orderBy,
    take: 200,
    include: {
      class: { select: { id: true, name: true, division: true, yearOfStudy: true, facultyId: true } },
      type: true,
      student: { select: { name: true, email: true } },
      current: { select: { number: true, sha256: true } },
    },
  });
}
