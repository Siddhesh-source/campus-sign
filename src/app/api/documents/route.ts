import { createDocument } from "@/server/documents";
import { UserFacingError } from "@/server/errors";
import { jsonAction, readUpload } from "@/server/http";

export async function POST(req: Request) {
  return jsonAction("createDocument", async ({ user, meta }) => {
    const { form, file } = await readUpload(req);
    if (!file) throw new UserFacingError("VALIDATION", "Choose a PDF to upload.", { file: "Choose a PDF to upload." });
    return createDocument(
      user,
      { classId: String(form.get("classId") ?? ""), typeId: String(form.get("typeId") ?? ""), title: String(form.get("title") ?? "") },
      file,
      meta,
    );
  });
}
