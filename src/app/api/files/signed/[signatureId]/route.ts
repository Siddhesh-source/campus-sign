import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { getSignedFile } from "@/server/signing";
import { pdfResponse } from "@/server/http";

export async function GET(req: Request, { params }: { params: Promise<{ signatureId: string }> }) {
  const user = await getCurrentUser();
  const { signatureId } = await params;
  const file = user ? await getSignedFile(user, signatureId) : null;
  if (!file) return new NextResponse("Not found", { status: 404 });
  const inline = new URL(req.url).searchParams.has("inline");
  return pdfResponse(file.storageKey, `signed-${file.code}.pdf`, inline ? "inline" : "attachment");
}
