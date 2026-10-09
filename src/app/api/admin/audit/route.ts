import { NextResponse } from "next/server";
import { getCurrentUser, requestMeta } from "@/server/auth";
import { auditCsv } from "@/server/admin";
import { audit } from "@/server/audit";
import { db } from "@/server/db";

/** CSV export of the (filtered) audit log. Admins only; the export itself is audited. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") return new NextResponse("Not found", { status: 404 });
  const p = new URL(req.url).searchParams;
  const filter = { actor: p.get("actor") ?? undefined, action: p.get("action") ?? undefined, target: p.get("target") ?? undefined, from: p.get("from") ?? undefined, to: p.get("to") ?? undefined, q: p.get("q") ?? undefined };
  const csv = await auditCsv(filter);
  const meta = await requestMeta();
  await db.$transaction((tx) => audit(tx, { actor: user, action: "audit.export", metadata: filter, meta }));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="campussign-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
