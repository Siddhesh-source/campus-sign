import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Private file storage. Files live outside the web root and are only served
 * through route handlers that re-check access. Swap for an S3-compatible
 * adapter behind the same two functions when a deploy target exists.
 */
const KEY_RE = /^[a-f0-9]{32}\.pdf$/;

function root() {
  // turbopackIgnore: resolved at runtime; never trace (or bundle) stored documents.
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.STORAGE_DIR ?? "./storage");
}

export async function putFile(bytes: Uint8Array): Promise<string> {
  const key = `${randomBytes(16).toString("hex")}.pdf`;
  await mkdir(root(), { recursive: true, mode: 0o700 });
  await writeFile(path.join(root(), key), bytes, { flag: "wx", mode: 0o600 });
  return key;
}

export async function getFile(key: string): Promise<Buffer> {
  if (!KEY_RE.test(key)) throw new Error("Invalid storage key");
  return readFile(path.join(root(), key));
}
