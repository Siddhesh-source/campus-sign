import "server-only";

/**
 * Per-process sliding-window limiter for anonymous endpoints (public
 * verification), so the ledger can't be hammered through them. Pilot-scale:
 * one app instance. Move to a shared store when running more than one.
 */
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

export function allowPublic(key: string, max = 60, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return true;
}
