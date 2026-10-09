import "server-only";
import { randomBytes } from "node:crypto";
import { log } from "./log";

/** Errors whose message is safe to show the user verbatim. */
export class UserFacingError extends Error {
  constructor(
    public readonly code:
      | "UNAUTHENTICATED"
      | "FORBIDDEN"
      | "VALIDATION"
      | "NOT_FOUND"
      | "CODE_INVALID"
      | "RATE_LIMITED"
      | "CLASS_FULL"
      | "ALREADY_ENROLLED"
      | "STALE",
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
  }
}

export type ActionResult<T = void> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code: string; fieldErrors?: Record<string, string> };

/** Run a server action body and map errors to a result the UI can render. */
export async function runAction<T>(name: string, fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    if (err instanceof UserFacingError) {
      return { ok: false, error: err.message, code: err.code, fieldErrors: err.fieldErrors };
    }
    // Next.js redirect()/notFound() throw control-flow errors; let them through.
    if (err && typeof err === "object" && "digest" in err && typeof err.digest === "string" && err.digest.startsWith("NEXT_")) {
      throw err;
    }
    const ref = randomBytes(3).toString("hex").toUpperCase();
    log.error({ err, action: name, ref }, "action failed");
    return { ok: false, error: `Something went wrong. Reference ${ref}.`, code: "INTERNAL" };
  }
}
