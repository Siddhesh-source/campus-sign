import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign as edSign,
  verify as edVerify,
} from "node:crypto";
import { db, type Tx } from "./db";
import { audit, type RequestMeta } from "./audit";
import { UserFacingError } from "./errors";
import { assertDecidable, canView } from "./documents";
import { sha256Hex, stampSignedPdf } from "./pdf";
import { getFile, putFile } from "./storage";
import type { CurrentUser } from "./auth";

// ── Key encryption ────────────────────────────────────────────────────────

function kek(): Buffer {
  const raw = process.env.SIGNING_KEK;
  const key = raw ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== 32) {
    throw new UserFacingError("FORBIDDEN", "Signing isn't configured on this server. An administrator must set SIGNING_KEK.");
  }
  return key;
}

/** AES-256-GCM, AAD = credential id so ciphertexts can't be swapped between rows. */
function sealPrivateKey(credentialId: string, pkcs8Der: Buffer) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", kek(), iv);
  c.setAAD(Buffer.from(credentialId));
  const body = Buffer.concat([c.update(pkcs8Der), c.final()]);
  return `v1.${iv.toString("base64")}.${c.getAuthTag().toString("base64")}.${body.toString("base64")}`;
}

function openPrivateKey(credentialId: string, sealed: string) {
  const [v, iv, tag, body] = sealed.split(".");
  if (v !== "v1") throw new Error("Unknown key envelope");
  const d = createDecipheriv("aes-256-gcm", kek(), Buffer.from(iv, "base64"));
  d.setAAD(Buffer.from(credentialId));
  d.setAuthTag(Buffer.from(tag, "base64"));
  const der = Buffer.concat([d.update(Buffer.from(body, "base64")), d.final()]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

/** Deterministic JSON: sorted keys, no whitespace. This is exactly what gets signed. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}

// ── Credentials ───────────────────────────────────────────────────────────

async function issueCredential(tx: Tx, facultyId: string) {
  const id = randomUUID();
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" });
  const keyId = `ed25519:${createHash("sha256").update(spki).digest("hex").slice(0, 16)}`;
  return tx.signingCredential.create({
    data: {
      id,
      facultyId,
      keyId,
      publicKeyPem: publicKey.export({ format: "pem", type: "spki" }).toString(),
      encryptedPrivateKey: sealPrivateKey(id, privateKey.export({ format: "der", type: "pkcs8" })),
    },
    select: { id: true, keyId: true, createdAt: true, status: true },
  });
}

export async function createCredential(actor: CurrentUser, meta: RequestMeta) {
  if (actor.role !== "FACULTY") throw new UserFacingError("FORBIDDEN", "Only verified faculty have signing credentials.");
  kek();
  return db.$transaction(async (tx) => {
    const active = await tx.signingCredential.findFirst({ where: { facultyId: actor.id, status: "ACTIVE" } });
    if (active) throw new UserFacingError("STALE", "You already have an active signing credential.");
    const cred = await issueCredential(tx, actor.id);
    await audit(tx, { actor, action: "credential.create", targetType: "credential", targetId: cred.keyId, meta });
    return cred;
  });
}

/** Old key becomes ROTATED: its past signatures stay valid; it can't sign again. */
export async function rotateCredential(actor: CurrentUser, meta: RequestMeta) {
  if (actor.role !== "FACULTY") throw new UserFacingError("FORBIDDEN", "Only verified faculty have signing credentials.");
  kek();
  return db.$transaction(async (tx) => {
    const res = await tx.signingCredential.updateMany({
      where: { facultyId: actor.id, status: "ACTIVE" },
      data: { status: "ROTATED", retiredAt: new Date() },
    });
    const cred = await issueCredential(tx, actor.id);
    await audit(tx, { actor, action: "credential.rotate", targetType: "credential", targetId: cred.keyId, metadata: { retired: res.count }, meta });
    return cred;
  });
}

/** Revoked keys fail verification for every signature they made. */
export async function revokeCredential(actor: CurrentUser, credentialId: string, reason: string, meta: RequestMeta) {
  const reasonText = reason.trim().slice(0, 300) || "Revoked";
  return db.$transaction(async (tx) => {
    const cred = await tx.signingCredential.findUnique({ where: { id: credentialId } });
    const allowed = cred && (actor.role === "ADMIN" || (actor.role === "FACULTY" && cred.facultyId === actor.id));
    if (!cred || !allowed) throw new UserFacingError("NOT_FOUND", "That credential doesn't exist.");
    if (cred.status === "REVOKED") throw new UserFacingError("STALE", "That credential is already revoked.");
    await tx.signingCredential.update({ where: { id: credentialId }, data: { status: "REVOKED", retiredAt: new Date(), revokedReason: reasonText } });
    await audit(tx, { actor, action: "credential.revoke", targetType: "credential", targetId: cred.keyId, metadata: { reason: reasonText }, meta });
  });
}

/** Used when an admin revokes faculty access: every key that person holds dies with it. */
export async function revokeCredentialsForEmail(tx: Tx, email: string, reason: string) {
  const user = await tx.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return 0;
  const res = await tx.signingCredential.updateMany({
    where: { facultyId: user.id, status: { in: ["ACTIVE", "ROTATED"] } },
    data: { status: "REVOKED", retiredAt: new Date(), revokedReason: reason },
  });
  return res.count;
}

export async function listCredentials(facultyId: string) {
  return db.signingCredential.findMany({
    where: { facultyId },
    orderBy: { createdAt: "desc" },
    select: { id: true, keyId: true, status: true, createdAt: true, retiredAt: true, revokedReason: true, _count: { select: { signatures: true } } },
  });
}

// ── Approve & sign ────────────────────────────────────────────────────────

function verificationCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (const b of randomBytes(12)) s += alphabet[b % alphabet.length];
  return `CS-${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

export type SignInput = { versionId: string; expectedSha256: string; confirm: boolean };

/**
 * One transaction: explicit confirmation, fresh authorization, stamp the PDF,
 * hash it, sign the canonical payload, store, record APPROVED.
 */
export async function approveAndSign(actor: CurrentUser, documentId: string, input: SignInput, meta: RequestMeta) {
  if (actor.role !== "FACULTY") throw new UserFacingError("NOT_FOUND", "That document doesn't exist or you can't see it.");
  if (!input.confirm) throw new UserFacingError("VALIDATION", "Confirm that you've reviewed this exact version before signing.", { confirm: "Required" });
  kek();

  return db.$transaction(
    async (tx) => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "document" WHERE "id" = ${documentId} FOR UPDATE`;
      if (!rows[0]) throw new UserFacingError("NOT_FOUND", "That document doesn't exist or you can't see it.");
      const doc = await tx.document.findUniqueOrThrow({
        where: { id: documentId },
        include: { class: true, type: true, current: true },
      });

      // Fresh authorization: never trust the role cached at request start.
      if (!canView(actor, doc)) throw new UserFacingError("NOT_FOUND", "That document doesn't exist or you can't see it.");
      const access = await tx.facultyAccess.findUnique({ where: { email: actor.email }, select: { status: true } });
      if (access?.status !== "APPROVED") throw new UserFacingError("FORBIDDEN", "Your faculty access isn't active, so you can't sign.");
      if (doc.class.archivedAt) throw new UserFacingError("FORBIDDEN", "This class is archived.");
      if (!doc.type.active) throw new UserFacingError("FORBIDDEN", "This document type is no longer accepted.");
      assertDecidable(doc, input.versionId);
      const version = doc.current!;
      if (version.sha256 !== input.expectedSha256) {
        throw new UserFacingError("STALE", "The file hash doesn't match what you reviewed. Reload and check the document again.");
      }
      const cred = await tx.signingCredential.findFirst({ where: { facultyId: actor.id, status: "ACTIVE" } });
      if (!cred) throw new UserFacingError("FORBIDDEN", "Create a signing credential before approving documents.");

      const signatureId = randomUUID();
      const code = verificationCode();
      const signedAt = new Date();
      const base = (process.env.BETTER_AUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
      const original = await getFile(version.storageKey);
      if (sha256Hex(original) !== version.sha256) throw new Error(`Stored file for version ${version.id} doesn't match its hash`);

      const signedPdf = await stampSignedPdf(original, {
        code,
        verifyUrl: `${base}/verify/${code}`,
        signerName: actor.name,
        signerKeyId: cred.keyId,
        className: `${doc.class.name} · ${doc.class.yearOfStudy} ${doc.class.division}`,
        documentType: doc.type.name,
        versionNumber: version.number,
        originalSha256: version.sha256,
        signedAt,
      });
      const signedSha256 = sha256Hex(signedPdf);

      const payload = canonicalJson({
        v: 1,
        signatureId,
        code,
        documentId,
        versionId: version.id,
        versionNumber: version.number,
        documentType: doc.type.code,
        classId: doc.classId,
        decision: "APPROVED",
        originalSha256: version.sha256,
        signedSha256,
        signerKeyId: cred.keyId,
        signedAt: signedAt.toISOString(),
      });
      const signature = edSign(null, Buffer.from(payload), openPrivateKey(cred.id, cred.encryptedPrivateKey)).toString("base64");
      const signedStorageKey = await putFile(signedPdf);

      await tx.signature.create({
        data: {
          id: signatureId,
          code,
          documentId,
          versionId: version.id,
          credentialId: cred.id,
          decision: "APPROVED",
          payload,
          signature,
          originalSha256: version.sha256,
          signedSha256,
          signedStorageKey,
          signedAt,
        },
      });
      await tx.document.update({ where: { id: documentId }, data: { status: "APPROVED" } });
      await tx.documentEvent.create({
        data: { documentId, versionId: version.id, actorId: actor.id, actorRole: "FACULTY", type: "APPROVED_SIGNED" },
      });
      await audit(tx, {
        actor,
        action: "document.approve_sign",
        targetType: "document",
        targetId: documentId,
        metadata: { code, keyId: cred.keyId, originalSha256: version.sha256, signedSha256 },
        meta,
      });
      return { signatureId, code, signedSha256 };
    },
    { timeout: 20_000 },
  );
}

/** Signed PDF download: same access rule as the document itself. */
export async function getSignedFile(actor: CurrentUser, signatureId: string) {
  const sig = await db.signature.findUnique({
    where: { id: signatureId },
    include: { document: { include: { class: { select: { facultyId: true } } } } },
  });
  if (!sig || !canView(actor, sig.document)) return null;
  return { storageKey: sig.signedStorageKey, code: sig.code };
}

// ── Public verification ───────────────────────────────────────────────────

export type VerifyStatus = "VALID" | "MODIFIED_OR_UNKNOWN" | "REVOKED" | "INVALID_SIGNATURE";

/** Public result. Deliberately contains no student identity and no document title. */
export type VerifyResult = {
  status: VerifyStatus;
  isUnsignedOriginal?: boolean;
  record?: {
    code: string;
    documentType: string;
    className: string;
    signerName: string;
    signerKeyId: string;
    credentialStatus: "ACTIVE" | "ROTATED" | "REVOKED";
    versionNumber: number;
    decision: string;
    signedAt: Date;
    originalSha256: string;
    signedSha256: string;
  };
};

const sigInclude = {
  credential: { include: { faculty: { select: { name: true } } } },
  document: { include: { type: { select: { name: true } }, class: { select: { name: true, yearOfStudy: true, division: true } } } },
  version: { select: { number: true, sha256: true } },
} as const;

type SigRow = NonNullable<Awaited<ReturnType<typeof findSig>>>;
function findSig(where: { signedSha256: string } | { code: string }) {
  return db.signature.findUnique({ where: where as { code: string }, include: sigInclude });
}

function checkSignature(sig: SigRow): VerifyStatus {
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(sig.payload);
  } catch {
    return "INVALID_SIGNATURE";
  }
  // The stored row and the signed statement must agree on every bound field.
  const bound =
    payload.signatureId === sig.id &&
    payload.code === sig.code &&
    payload.documentId === sig.documentId &&
    payload.versionId === sig.versionId &&
    payload.originalSha256 === sig.originalSha256 &&
    payload.originalSha256 === sig.version.sha256 &&
    payload.signedSha256 === sig.signedSha256 &&
    payload.signerKeyId === sig.credential.keyId &&
    payload.decision === sig.decision &&
    canonicalJson(payload) === sig.payload;
  if (!bound) return "INVALID_SIGNATURE";
  const ok = edVerify(null, Buffer.from(sig.payload), createPublicKey(sig.credential.publicKeyPem), Buffer.from(sig.signature, "base64"));
  if (!ok) return "INVALID_SIGNATURE";
  if (sig.credential.status === "REVOKED") return "REVOKED";
  return "VALID";
}

function toRecord(sig: SigRow): VerifyResult["record"] {
  const c = sig.document.class;
  return {
    code: sig.code,
    documentType: sig.document.type.name,
    className: `${c.name} · ${c.yearOfStudy} ${c.division}`,
    signerName: sig.credential.faculty.name,
    signerKeyId: sig.credential.keyId,
    credentialStatus: sig.credential.status,
    versionNumber: sig.version.number,
    decision: sig.decision,
    signedAt: sig.signedAt,
    originalSha256: sig.originalSha256,
    signedSha256: sig.signedSha256,
  };
}

export async function verifyHash(sha256: string): Promise<VerifyResult> {
  const hash = sha256.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) return { status: "MODIFIED_OR_UNKNOWN" };
  const sig = await findSig({ signedSha256: hash });
  if (!sig) {
    const original = await db.signature.findFirst({ where: { originalSha256: hash }, select: { id: true } });
    return { status: "MODIFIED_OR_UNKNOWN", isUnsignedOriginal: !!original };
  }
  return { status: checkSignature(sig), record: toRecord(sig) };
}

export async function verifyBytes(bytes: Uint8Array) {
  return verifyHash(sha256Hex(bytes));
}

/** Look up by printed code. Confirms the record and signature; the file itself must be checked by hash. */
export async function verifyCode(code: string): Promise<VerifyResult | null> {
  const clean = code.trim().toUpperCase();
  if (!/^CS-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(clean)) return null;
  const sig = await findSig({ code: clean });
  if (!sig) return null;
  return { status: checkSignature(sig), record: toRecord(sig) };
}
