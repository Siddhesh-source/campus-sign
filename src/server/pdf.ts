import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { UserFacingError } from "./errors";

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export function sha256Hex(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Validate an upload is a real, parseable PDF within limits. */
export async function inspectPdf(bytes: Uint8Array): Promise<{ pageCount: number; sha256: string }> {
  if (bytes.byteLength === 0) throw new UserFacingError("VALIDATION", "That file is empty.", { file: "That file is empty." });
  if (bytes.byteLength > MAX_PDF_BYTES) {
    throw new UserFacingError("VALIDATION", "PDFs must be 10 MB or smaller.", { file: "PDFs must be 10 MB or smaller." });
  }
  const head = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  if (!head.includes("%PDF-")) throw new UserFacingError("VALIDATION", "Only PDF files can be submitted.", { file: "Upload a PDF file." });
  try {
    const doc = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = doc.getPageCount();
    if (pageCount < 1) throw new Error("no pages");
    return { pageCount, sha256: sha256Hex(bytes) };
  } catch {
    throw new UserFacingError("VALIDATION", "This PDF couldn't be read. Export it again and retry.", { file: "This PDF couldn't be read." });
  }
}

export type CertificateInfo = {
  code: string;
  verifyUrl: string;
  signerName: string;
  signerKeyId: string;
  className: string;
  documentType: string;
  versionNumber: number;
  originalSha256: string;
  signedAt: Date;
  /** Approval route position; omitted for single-step routes. */
  stepOrder?: number;
  totalSteps?: number;
  stepLabel?: string;
};

const INK = rgb(0.06, 0.1, 0.09);
const MUTED = rgb(0.36, 0.4, 0.38);
const GREEN = rgb(0.055, 0.353, 0.29);
const RULE = rgb(0.85, 0.87, 0.84);

/**
 * Append a cosmetic certificate page. The cryptographic proof is the stored
 * Ed25519 signature over this file's hash, not anything drawn here.
 * Deterministic for a given input (fixed dates, no random IDs in the file).
 */
export async function stampSignedPdf(original: Uint8Array, info: CertificateInfo): Promise<Uint8Array> {
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  const fixed = new Date(info.signedAt);
  doc.setProducer("CampusSign");
  doc.setCreator("CampusSign");
  doc.setModificationDate(fixed);
  doc.setSubject(`CampusSign signature ${info.code}`);
  doc.setKeywords(["campussign", info.code]);

  const first = doc.getPage(0);
  const { width, height } = first.getSize();
  const page = doc.addPage([width, height]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  drawSeal(page, width - 120, height - 130, 62);
  let y = height - 90;
  page.drawText("CampusSign", { x: 56, y, size: 12, font: bold, color: GREEN });
  y -= 40;
  page.drawText("Signature certificate", { x: 56, y, size: 26, font: bold, color: INK });
  y -= 22;
  page.drawText("Approved and digitally signed. This page is a visual summary;", { x: 56, y, size: 10.5, font, color: MUTED });
  y -= 14;
  page.drawText("the cryptographic signature is verified at the address below.", { x: 56, y, size: 10.5, font, color: MUTED });
  y -= 36;

  const rows: [string, string, PDFFont][] = [
    ["Decision", info.totalSteps && info.totalSteps > 1 ? `Approved · step ${info.stepOrder} of ${info.totalSteps} (${info.stepLabel})` : "Approved", font],
    ["Signed by", info.signerName, font],
    ["Class", info.className, font],
    ["Document type", info.documentType, font],
    ["Version", `v${info.versionNumber}`, mono],
    ["Signed at", `${fixed.toISOString().replace("T", " ").slice(0, 19)} UTC`, mono],
    ["Signing key", info.signerKeyId, mono],
    ["Original SHA-256", info.originalSha256.slice(0, 32), mono],
    ["", info.originalSha256.slice(32), mono],
    ["Verification code", info.code, mono],
  ];
  for (const [label, value, f] of rows) {
    if (label) page.drawLine({ start: { x: 56, y: y + 14 }, end: { x: width - 56, y: y + 14 }, thickness: 0.5, color: RULE });
    page.drawText(label.toUpperCase(), { x: 56, y, size: 8, font: bold, color: MUTED });
    page.drawText(value, { x: 200, y, size: 10.5, font: f, color: INK });
    y -= 24;
  }
  y -= 16;
  page.drawText("Verify this document", { x: 56, y, size: 12, font: bold, color: INK });
  y -= 18;
  page.drawText(info.verifyUrl, { x: 56, y, size: 10, font: mono, color: GREEN });
  y -= 16;
  page.drawText("Any change to this file, even one byte, makes verification fail.", { x: 56, y, size: 9.5, font, color: MUTED });

  return doc.save({ useObjectStreams: false });
}

function drawSeal(page: PDFPage, cx: number, cy: number, r: number) {
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: GREEN, borderWidth: 2 });
  page.drawCircle({ x: cx, y: cy, size: r - 7, borderColor: GREEN, borderWidth: 0.6, borderDashArray: [2, 3] });
  // Guilloché-style rosette: hypotrochoid drawn as short line segments.
  const R = 30, rr = 7, d = 17;
  let prev: { x: number; y: number } | null = null;
  for (let i = 0; i <= 720; i++) {
    const t = (i / 720) * Math.PI * 2 * 7;
    const x = cx + (R - rr) * Math.cos(t) + d * Math.cos(((R - rr) / rr) * t);
    const y = cy + (R - rr) * Math.sin(t) - d * Math.sin(((R - rr) / rr) * t);
    if (prev) page.drawLine({ start: prev, end: { x, y }, thickness: 0.35, color: GREEN, opacity: 0.8 });
    prev = { x, y };
  }
  page.drawCircle({ x: cx, y: cy, size: 13, color: rgb(1, 1, 1) });
  page.drawLine({ start: { x: cx - 6, y: cy }, end: { x: cx - 1.5, y: cy - 5 }, thickness: 2.4, color: GREEN });
  page.drawLine({ start: { x: cx - 1.5, y: cy - 5 }, end: { x: cx + 7, y: cy + 5 }, thickness: 2.4, color: GREEN });
}
