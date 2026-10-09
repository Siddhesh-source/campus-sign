import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "./db";

// ── Signing credentials (admin view: metadata only, never key material) ──

export async function listAllCredentials(filter: { q?: string; status?: string }) {
  const q = filter.q?.trim();
  const status = ["ACTIVE", "ROTATED", "REVOKED"].includes(filter.status ?? "") ? (filter.status as "ACTIVE" | "ROTATED" | "REVOKED") : undefined;
  return db.signingCredential.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ keyId: { contains: q } }, { faculty: { email: { contains: q, mode: "insensitive" } } }, { faculty: { name: { contains: q, mode: "insensitive" } } }] } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    select: {
      id: true,
      keyId: true,
      status: true,
      createdAt: true,
      retiredAt: true,
      revokedReason: true,
      faculty: { select: { name: true, email: true } },
      _count: { select: { signatures: true } },
    },
  });
}

/**
 * Compromise response: every document a key signed. Metadata only (no titles,
 * no student identity, no files) so admins can coordinate re-signing.
 */
export async function documentsSignedByKey(keyId: string) {
  const cred = await db.signingCredential.findUnique({
    where: { keyId },
    select: { id: true, keyId: true, status: true, revokedReason: true, faculty: { select: { name: true, email: true } } },
  });
  if (!cred) return null;
  const sigs = await db.signature.findMany({
    where: { credentialId: cred.id },
    orderBy: { signedAt: "desc" },
    select: {
      code: true,
      signedAt: true,
      stepOrder: true,
      totalSteps: true,
      documentId: true,
      document: { select: { status: true, type: { select: { name: true } }, class: { select: { name: true, yearOfStudy: true, division: true, faculty: { select: { email: true } } } } } },
    },
  });
  return { credential: cred, signatures: sigs };
}

// ── Audit investigation ───────────────────────────────────────────────────

export type AuditFilter = {
  q?: string;
  actor?: string;
  action?: string;
  target?: string;
  from?: string;
  to?: string;
  cursor?: string;
  /** Force-scope to one actor (faculty/student activity pages). */
  actorId?: string;
};

function whereFor(f: AuditFilter): Prisma.AuditEventWhereInput {
  const and: Prisma.AuditEventWhereInput[] = [];
  if (f.actorId) and.push({ actorId: f.actorId });
  if (f.actor?.trim()) and.push({ actorEmail: { contains: f.actor.trim(), mode: "insensitive" } });
  if (f.action?.trim()) and.push({ action: { startsWith: f.action.trim() } });
  if (f.target?.trim()) and.push({ targetId: { contains: f.target.trim() } });
  const from = f.from && !Number.isNaN(Date.parse(f.from)) ? new Date(f.from) : null;
  const to = f.to && !Number.isNaN(Date.parse(f.to)) ? new Date(new Date(f.to).getTime() + 24 * 60 * 60_000) : null;
  if (from || to) and.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lt: to } : {}) } });
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({ OR: [{ actorEmail: { contains: q, mode: "insensitive" } }, { action: { contains: q, mode: "insensitive" } }, { targetId: { contains: q } }, { ip: { contains: q } }] });
  }
  return and.length ? { AND: and } : {};
}

export async function searchAudit(f: AuditFilter, take = 50) {
  return db.auditEvent.findMany({
    where: whereFor(f),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(f.cursor ? { cursor: { id: f.cursor }, skip: 1 } : {}),
  });
}

export async function auditActions() {
  const rows = await db.auditEvent.findMany({ distinct: ["action"], select: { action: true }, orderBy: { action: "asc" } });
  return rows.map((r) => r.action);
}

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Neutralise spreadsheet formula injection, then quote.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function auditCsv(f: AuditFilter, limit = 10_000) {
  const rows = await db.auditEvent.findMany({ where: whereFor(f), orderBy: { createdAt: "desc" }, take: limit });
  const head = ["createdAt", "actorEmail", "action", "targetType", "targetId", "ip", "userAgent", "metadata"];
  const lines = rows.map((r) => [r.createdAt.toISOString(), r.actorEmail, r.action, r.targetType, r.targetId, r.ip, r.userAgent, r.metadata].map(csvCell).join(","));
  return [head.join(","), ...lines].join("\r\n");
}
