/**
 * Pure ledger rules, shared by the Fabric chaincode and the app (and its
 * in-memory test ledger) so both enforce exactly the same semantics.
 * No Fabric or Node imports here.
 */

export const EVENT_TYPES = ["SUBMITTED", "APPROVED", "REJECTED", "CORRECTIONS_REQUESTED", "KEY_REVOKED"] as const;
export type LedgerEventType = (typeof EVENT_TYPES)[number];

/** The ONLY fields an event may carry. No names, PRNs, emails, titles, comments, files or keys. */
export const ALLOWED_KEYS = [
  "eventId",
  "type",
  "documentRef",
  "versionId",
  "versionNumber",
  "sha256",
  "signedSha256",
  "signerKeyId",
  "occurredAt",
] as const;

export type LedgerEventInput = {
  eventId: string;
  type: LedgerEventType;
  documentRef?: string;
  versionId?: string;
  versionNumber?: number;
  sha256?: string;
  signedSha256?: string;
  signerKeyId?: string;
  occurredAt: string;
};

export type StoredLedgerEvent = LedgerEventInput & {
  txId: string;
  txTimestamp: string;
  submitterMsp: string;
};

export class LedgerValidationError extends Error {}

const HEX64 = /^[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9_-]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_ID = /^ed25519:[a-f0-9]{16}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

/** Deterministic JSON (sorted keys, undefined dropped). */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

function need(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new LedgerValidationError(msg);
}

/** Strict allow-list validation: unknown keys are rejected and every value must match a fixed format. */
export function validateEvent(raw: unknown): LedgerEventInput {
  need(raw && typeof raw === "object" && !Array.isArray(raw), "event must be an object");
  const o = raw as Record<string, unknown>;
  for (const k of Object.keys(o)) need((ALLOWED_KEYS as readonly string[]).includes(k), `field not allowed on-chain: ${k}`);
  // Every field below has a strict format (uuid, hex-64, opaque id, ed25519 key id, ISO time),
  // so free text such as names, emails, PRNs or comments can never validate.
  for (const [k, v] of Object.entries(o)) need(typeof v === "string" || typeof v === "number", `field ${k} must be a string or number`);
  need(typeof o.eventId === "string" && UUID.test(o.eventId), "eventId must be a uuid");
  need(typeof o.type === "string" && (EVENT_TYPES as readonly string[]).includes(o.type), "unknown event type");
  need(typeof o.occurredAt === "string" && ISO_UTC.test(o.occurredAt), "occurredAt must be ISO UTC time");
  if (o.documentRef !== undefined) need(typeof o.documentRef === "string" && ID.test(o.documentRef), "bad documentRef");
  if (o.versionId !== undefined) need(typeof o.versionId === "string" && ID.test(o.versionId), "bad versionId");
  if (o.versionNumber !== undefined) need(Number.isInteger(o.versionNumber) && (o.versionNumber as number) > 0, "bad versionNumber");
  if (o.sha256 !== undefined) need(typeof o.sha256 === "string" && HEX64.test(o.sha256), "bad sha256");
  if (o.signedSha256 !== undefined) need(typeof o.signedSha256 === "string" && HEX64.test(o.signedSha256), "bad signedSha256");
  if (o.signerKeyId !== undefined) need(typeof o.signerKeyId === "string" && KEY_ID.test(o.signerKeyId), "bad signerKeyId");

  const t = o.type as LedgerEventType;
  if (t === "KEY_REVOKED") {
    need(o.signerKeyId, "KEY_REVOKED needs signerKeyId");
  } else {
    need(o.documentRef && o.versionId && o.versionNumber && o.sha256, `${t} needs documentRef, versionId, versionNumber, sha256`);
  }
  if (t === "APPROVED") need(o.signedSha256 && o.signerKeyId, "APPROVED needs signedSha256 and signerKeyId");
  return o as unknown as LedgerEventInput;
}

/** The app-supplied part of a stored event, for comparison. */
export function inputOf(e: LedgerEventInput | StoredLedgerEvent): LedgerEventInput {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED_KEYS) if ((e as Record<string, unknown>)[k] !== undefined) out[k] = (e as Record<string, unknown>)[k];
  return out as LedgerEventInput;
}

export type RecordDecision = { action: "CREATE" } | { action: "REPLAY"; stored: StoredLedgerEvent } | { action: "CONFLICT"; stored: StoredLedgerEvent };

/**
 * Idempotency: the eventId is the key. Re-submitting an identical event is a
 * no-op that returns the original; a different payload under the same id is a conflict.
 */
export function decideRecord(existing: StoredLedgerEvent | null, incoming: LedgerEventInput): RecordDecision {
  if (!existing) return { action: "CREATE" };
  return canonical(inputOf(existing)) === canonical(inputOf(incoming)) ? { action: "REPLAY", stored: existing } : { action: "CONFLICT", stored: existing };
}

/** Organisations allowed to write events. Others (e.g. an auditor org) may only read. */
export const WRITER_MSPS = ["Org1MSP"];
