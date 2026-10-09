import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getVersionFile } from "@/server/documents";
import { pdfResponse } from "@/server/http";

/** The exact submitted bytes. Access is re-checked on every request. */
export async function GET(req: Request, { params }: { params: Promise<{ versionId: string }> }) {
  const user = await getCurrentUser();
  const { versionId } = await params;
  const file = user ? await getVersionFile(user, versionId) : null;
  if (!file) return new NextResponse("Not found", { status: 404 });
  const download = new URL(req.url).searchParams.has("download");
  return pdfResponse(file.storageKey, file.name, download ? "attachment" : "inline");
}
