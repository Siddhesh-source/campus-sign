import { request } from "@playwright/test";

/**
 * `next dev` compiles each route on first request. Six workers hitting cold
 * routes at once can take longer than a test's timeouts, so compile the
 * routes the suite uses, one at a time, before any test starts.
 */
export default async function warmup() {
  const ctx = await request.newContext({ baseURL: "http://localhost:3000" });
  const res = await ctx.post("/api/auth/dev/sign-in", { data: { email: "admin@vit.edu", name: "Registrar Admin" } });
  if (!res.ok()) throw new Error(`warm-up sign-in failed: ${res.status()}`);
  const routes = [
    "/sign-in", "/verify", "/verify/CS-AAAA-BBBB-CCCC", "/denied", "/dashboard", "/join", "/documents", "/documents/new",
    "/classes/new", "/inbox", "/signing", "/activity", "/faculty-access",
    "/admin", "/admin/document-types", "/admin/credentials", "/admin/audit", "/admin/ledger", "/api/admin/audit",
  ];
  for (const path of routes) await ctx.get(path, { timeout: 120_000 }).catch(() => {});
  await ctx.dispose();
}
