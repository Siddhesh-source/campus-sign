import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, requestMeta } from "./auth";
import { runAction } from "./errors";
import { MAX_PDF_BYTES } from "./pdf";
import { getFile } from "./storage";
import type { UploadedFile } from "./documents";

/** Pull one PDF out of a multipart request, with a hard size cap before buffering. */
export async function readUpload(req: Request): Promise<{ form: FormData; file: UploadedFile | null }> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_PDF_BYTES + 64 * 1024) return { form: new FormData(), file: { bytes: new Uint8Array(MAX_PDF_BYTES + 1), name: "too-large.pdf" } };
  const form = await req.formData();
  const f = form.get("file");
  if (!(f instanceof File) || f.size === 0) return { form, file: null };
  return { form, file: { bytes: new Uint8Array(await f.arrayBuffer()), name: f.name || "document.pdf" } };
}

export async function jsonAction<T>(name: string, fn: (ctx: { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; meta: Awaited<ReturnType<typeof requestMeta>> }) => Promise<T>) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "Your session ended. Sign in again.", code: "UNAUTHENTICATED" }, { status: 401 });
  const meta = await requestMeta();
  const res = await runAction(name, () => fn({ user, meta }));
  const status = res.ok ? 200 : res.code === "NOT_FOUND" ? 404 : res.code === "INTERNAL" ? 500 : 400;
  return NextResponse.json(res, { status });
}

export async function pdfResponse(storageKey: string, filename: string, disposition: "inline" | "attachment") {
  const bytes = await getFile(storageKey);
  const safe = filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "document.pdf";
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${disposition}; filename="${safe}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
