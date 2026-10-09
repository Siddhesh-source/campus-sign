import { NextResponse } from "next/server";
import { getCurrentUser, requestMeta } from "@/server/auth";
import { getSignedFile } from "@/server/signing";
import { pdfResponse } from "@/server/http";
import { audit } from "@/server/audit";
import { db } from "@/server/db";

export async function GET(req: Request, { params }: { params: Promise<{ signatureId: string }> }) {
  const user = await getCurrentUser();
  const { signatureId } = await params;
  const file = user ? await getSignedFile(user, signatureId) : null;
  if (!user || !file) return new NextResponse("Not found", { status: 404 });
  const meta = await requestMeta();
  await db.$transaction((tx) => audit(tx, { actor: user, action: "signed_pdf.download", targetType: "signature", targetId: file.code, meta }));
  const inline = new URL(req.url).searchParams.has("inline");
  return pdfResponse(file.storageKey, `signed-${file.code}.pdf`, inline ? "inline" : "attachment");
}
