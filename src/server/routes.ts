import "server-only";
import { z } from "zod";
import { db, type Tx } from "./db";
import { audit, type RequestMeta } from "./audit";
import { UserFacingError } from "./errors";
import { isInstitutionEmail, normalizeEmail } from "@/lib/identity";
import type { CurrentUser } from "./auth";

/**
 * Approval routes. A document type has an ordered list of steps; a document
 * freezes the route when it is submitted (routeSnapshot), so editing a route
 * never changes documents already in flight.
 *
 *   step kinds:  CLASS_FACULTY  the faculty who owns the document's class
 *                DESIGNATED     a named verified faculty member (e.g. HoD)
 */
export type RouteStep = { order: number; label: string; kind: "CLASS_FACULTY" | "DESIGNATED"; approverEmail?: string };

export const DEFAULT_ROUTE: RouteStep[] = [{ order: 1, label: "Class faculty", kind: "CLASS_FACULTY" }];
export const MAX_STEPS = 5;

export async function routeForType(tx: Tx | typeof db, typeId: string): Promise<RouteStep[]> {
  const steps = await tx.approvalStep.findMany({ where: { typeId }, orderBy: { order: "asc" } });
  if (!steps.length) return DEFAULT_ROUTE;
  return steps.map((s) => ({ order: s.order, label: s.label, kind: s.kind, ...(s.approverEmail ? { approverEmail: s.approverEmail } : {}) }));
}

type RoutedDoc = { routeSnapshot: unknown; currentStep: number; class: { facultyId: string } };

export function routeOf(doc: { routeSnapshot: unknown }): RouteStep[] {
  const r = doc.routeSnapshot as RouteStep[] | null;
  return Array.isArray(r) && r.length ? r : DEFAULT_ROUTE;
}

export function currentStepOf(doc: { routeSnapshot: unknown; currentStep: number }): RouteStep {
  const route = routeOf(doc);
  return route[Math.min(Math.max(doc.currentStep, 1), route.length) - 1];
}

/** The single rule for "may this faculty member decide on this document right now?" */
export function isCurrentApprover(actor: CurrentUser, doc: RoutedDoc): boolean {
  if (actor.role !== "FACULTY") return false;
  const step = currentStepOf(doc);
  return step.kind === "CLASS_FACULTY" ? doc.class.facultyId === actor.id : step.approverEmail === actor.email;
}

/** Designated approvers whose step has been reached (they gain read access then). */
export function reachedApprovers(route: RouteStep[], uptoStep: number): string[] {
  return route.filter((s) => s.kind === "DESIGNATED" && s.order <= uptoStep && s.approverEmail).map((s) => s.approverEmail!);
}

// ── Admin configuration ───────────────────────────────────────────────────

const stepSchema = z
  .object({
    label: z.string().trim().min(2, "Name each step.").max(60, "Keep step names short."),
    kind: z.enum(["CLASS_FACULTY", "DESIGNATED"]),
    approverEmail: z.string().trim().optional().or(z.literal("")),
  })
  .transform((s) => ({ ...s, approverEmail: s.approverEmail ? normalizeEmail(s.approverEmail) : undefined }));

export async function setRoute(admin: CurrentUser, typeId: string, input: unknown, meta: RequestMeta) {
  const parsed = z.array(stepSchema).min(1, "A route needs at least one step.").max(MAX_STEPS, `At most ${MAX_STEPS} steps.`).safeParse(input);
  if (!parsed.success) throw new UserFacingError("VALIDATION", parsed.error.issues[0].message);
  const steps = parsed.data;
  for (const [i, s] of steps.entries()) {
    if (s.kind === "DESIGNATED") {
      if (!s.approverEmail || !isInstitutionEmail(s.approverEmail)) throw new UserFacingError("VALIDATION", `Step ${i + 1}: give the approver's @vit.edu email.`);
      const access = await db.facultyAccess.findUnique({ where: { email: s.approverEmail }, select: { status: true } });
      if (access?.status !== "APPROVED") throw new UserFacingError("VALIDATION", `Step ${i + 1}: ${s.approverEmail} isn't a verified faculty member yet.`);
    }
  }
  const emails = steps.filter((s) => s.approverEmail).map((s) => s.approverEmail);
  if (new Set(emails).size !== emails.length) throw new UserFacingError("VALIDATION", "The same person can't approve twice in one route.");

  return db.$transaction(async (tx) => {
    const type = await tx.documentType.findUnique({ where: { id: typeId } });
    if (!type) throw new UserFacingError("NOT_FOUND", "That document type doesn't exist.");
    await tx.approvalStep.deleteMany({ where: { typeId } });
    await tx.approvalStep.createMany({
      data: steps.map((s, i) => ({ typeId, order: i + 1, label: s.label, kind: s.kind, approverEmail: s.kind === "DESIGNATED" ? s.approverEmail : null })),
    });
    await audit(tx, {
      actor: admin,
      action: "route.update",
      targetType: "document_type",
      targetId: type.code,
      metadata: { steps: steps.map((s) => `${s.label}:${s.kind}${s.approverEmail ? `:${s.approverEmail}` : ""}`).join(" → ") },
      meta,
    });
  });
}

const typeSchema = z.object({
  name: z.string().trim().min(3, "Use at least 3 characters.").max(80, "Keep it under 80 characters."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z][A-Z0-9_]{2,39}$/, "Use capitals, digits and underscores, like LAB_REPORT."),
});

export async function createDocumentType(admin: CurrentUser, input: unknown, meta: RequestMeta) {
  const parsed = typeSchema.safeParse(input);
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new UserFacingError("VALIDATION", i.message, { [String(i.path[0])]: i.message });
  }
  return db.$transaction(async (tx) => {
    if (await tx.documentType.findUnique({ where: { code: parsed.data.code } })) {
      throw new UserFacingError("VALIDATION", "That code is already used.", { code: "That code is already used." });
    }
    const t = await tx.documentType.create({ data: parsed.data });
    await audit(tx, { actor: admin, action: "document_type.create", targetType: "document_type", targetId: t.code, metadata: { name: t.name }, meta });
    return t;
  });
}

export async function updateDocumentType(admin: CurrentUser, typeId: string, input: { name?: string; active?: boolean }, meta: RequestMeta) {
  const name = input.name === undefined ? undefined : typeSchema.shape.name.safeParse(input.name);
  if (name && !name.success) throw new UserFacingError("VALIDATION", name.error.issues[0].message, { name: name.error.issues[0].message });
  return db.$transaction(async (tx) => {
    const t = await tx.documentType.findUnique({ where: { id: typeId } });
    if (!t) throw new UserFacingError("NOT_FOUND", "That document type doesn't exist.");
    const updated = await tx.documentType.update({
      where: { id: typeId },
      data: { ...(name?.success ? { name: name.data } : {}), ...(input.active !== undefined ? { active: input.active } : {}) },
    });
    await audit(tx, {
      actor: admin,
      action: "document_type.update",
      targetType: "document_type",
      targetId: t.code,
      metadata: { ...(name?.success ? { name: name.data } : {}), ...(input.active !== undefined ? { active: input.active } : {}) },
      meta,
    });
    return updated;
  });
}

export async function listDocumentTypesWithRoutes() {
  const types = await db.documentType.findMany({
    orderBy: { name: "asc" },
    include: { steps: { orderBy: { order: "asc" } }, _count: { select: { documents: true } } },
  });
  return types.map((t) => ({
    ...t,
    route: t.steps.length ? t.steps.map((s) => ({ order: s.order, label: s.label, kind: s.kind, approverEmail: s.approverEmail ?? undefined })) : DEFAULT_ROUTE,
  }));
}
