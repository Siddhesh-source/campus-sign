import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "./db";

export type AuditAction =
  | "auth.sign_in"
  | "auth.denied"
  | "faculty.request"
  | "faculty.approve"
  | "faculty.reject"
  | "faculty.revoke"
  | "faculty.add"
  | "class.create"
  | "class.code.rotate"
  | "class.code.revoke"
  | "class.code.expiry"
  | "class.student.remove"
  | "enrollment.join"
  | "enrollment.leave"
  | "code.lookup.failed"
  | "code.lookup.locked"
  | "document.create"
  | "document.version"
  | "document.submit"
  | "document.review_start"
  | "document.reject"
  | "document.request_corrections"
  | "document.approve_sign"
  | "credential.create"
  | "credential.rotate"
  | "credential.revoke"
  | "route.update"
  | "document_type.create"
  | "document_type.update"
  | "signed_pdf.download"
  | "ops.kek_rotate"
  | "audit.export"
  | "ops.seed";

export type RequestMeta = { ip?: string | null; userAgent?: string | null };

export type AuditInput = {
  actor?: { id: string; email: string } | null;
  actorEmail?: string | null;
  action: AuditAction;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  meta?: RequestMeta;
};

/**
 * Write one audit row. Always pass the mutation's transaction so the action
 * and its audit record commit or roll back together.
 */
export async function audit(tx: Tx, input: AuditInput) {
  await tx.auditEvent.create({
    data: {
      actorId: input.actor?.id ?? null,
      actorEmail: input.actor?.email ?? input.actorEmail ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
      ip: input.meta?.ip ?? null,
      userAgent: input.meta?.userAgent?.slice(0, 300) ?? null,
    },
  });
}
