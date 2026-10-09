import "server-only";
import { db } from "./db";

/**
 * Brute-force protection for class-code lookups.
 *
 *   user:<id>  5 failures / 15 min  → lock 15 min, doubling per lock, max 24 h
 *   ip:<addr> 30 failures / 15 min  → lock 15 min
 *
 * Only failed lookups count. A successful lookup clears the user's failure
 * window but keeps lockCount, so repeat offenders escalate.
 */
export const LIMITS = {
  user: { max: 5, windowMs: 15 * 60_000, baseLockMs: 15 * 60_000, maxLockMs: 24 * 60 * 60_000 },
  ip: { max: 30, windowMs: 15 * 60_000, baseLockMs: 15 * 60_000, maxLockMs: 15 * 60_000 },
} as const;

type Kind = keyof typeof LIMITS;

export type LimitState = { locked: false; remaining: number } | { locked: true; retryAt: Date };

function keyFor(kind: Kind, id: string) {
  return `${kind}:${id}`;
}

export async function checkLimit(kind: Kind, id: string, now = new Date()): Promise<LimitState> {
  const row = await db.codeLookupLimit.findUnique({ where: { key: keyFor(kind, id) } });
  if (row?.lockedUntil && row.lockedUntil > now) return { locked: true, retryAt: row.lockedUntil };
  const inWindow = row && now.getTime() - row.windowStart.getTime() < LIMITS[kind].windowMs;
  return { locked: false, remaining: LIMITS[kind].max - (inWindow ? row.failures : 0) };
}

/** Record a failed attempt. Returns the lock time if this failure triggered a lock. */
export async function recordFailure(kind: Kind, id: string, now = new Date()): Promise<{ lockedUntil: Date | null; remaining: number }> {
  const cfg = LIMITS[kind];
  const key = keyFor(kind, id);
  return db.$transaction(async (tx) => {
    // Serialize concurrent failures for the same key.
    await tx.$executeRaw`INSERT INTO "code_lookup_limit" ("key","failures","windowStart","lockCount","updatedAt") VALUES (${key}, 0, ${now}, 0, ${now}) ON CONFLICT ("key") DO NOTHING`;
    const [row] = await tx.$queryRaw<
      { failures: number; windowStart: Date; lockCount: number }[]
    >`SELECT "failures","windowStart","lockCount" FROM "code_lookup_limit" WHERE "key" = ${key} FOR UPDATE`;

    const windowExpired = now.getTime() - row.windowStart.getTime() >= cfg.windowMs;
    const failures = (windowExpired ? 0 : row.failures) + 1;
    const windowStart = windowExpired ? now : row.windowStart;

    if (failures >= cfg.max) {
      const lockMs = Math.min(cfg.baseLockMs * 2 ** row.lockCount, cfg.maxLockMs);
      const lockedUntil = new Date(now.getTime() + lockMs);
      await tx.codeLookupLimit.update({
        where: { key },
        data: { failures: 0, windowStart: now, lockedUntil, lockCount: row.lockCount + 1 },
      });
      return { lockedUntil, remaining: 0 };
    }
    await tx.codeLookupLimit.update({ where: { key }, data: { failures, windowStart } });
    return { lockedUntil: null, remaining: cfg.max - failures };
  });
}

export async function clearFailures(kind: Kind, id: string, now = new Date()) {
  await db.codeLookupLimit.updateMany({ where: { key: keyFor(kind, id) }, data: { failures: 0, windowStart: now } });
}
