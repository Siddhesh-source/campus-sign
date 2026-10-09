import { addVersion } from "@/server/documents";
import { UserFacingError } from "@/server/errors";
import { jsonAction, readUpload } from "@/server/http";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return jsonAction("addVersion", async ({ user, meta }) => {
    const { file } = await readUpload(req);
    if (!file) throw new UserFacingError("VALIDATION", "Choose a PDF to upload.", { file: "Choose a PDF to upload." });
    return addVersion(user, id, file, meta);
  });
}
