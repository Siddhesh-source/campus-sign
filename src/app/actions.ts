"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requestMeta, requireActor } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/errors";
import { createClass, removeStudent, revokeCode, rotateCode, setCodeExpiry } from "@/server/classes";
import { joinClass, leaveClass, lookupCode, type ClassPreview } from "@/server/enrollment";
import { addFacultyEmail, decideFacultyAccess, requestFacultyAccess } from "@/server/faculty";
import { decideDocument, submitDocument } from "@/server/documents";
import { approveAndSign, createCredential, revokeCredential, rotateCredential, verifyHash } from "@/server/signing";

// ── Student ───────────────────────────────────────────────────────────────

export async function lookupCodeAction(code: string): Promise<ActionResult<ClassPreview>> {
  return runAction("lookupCode", async () => lookupCode(await requireActor("STUDENT"), code, await requestMeta()));
}

export async function joinClassAction(code: string) {
  const result = await runAction("joinClass", async () => joinClass(await requireActor("STUDENT"), code, await requestMeta()));
  if (result.ok) revalidatePath("/dashboard");
  return result;
}

export async function leaveClassAction(enrollmentId: string) {
  const result = await runAction("leaveClass", async () => leaveClass(await requireActor("STUDENT"), enrollmentId, await requestMeta()));
  if (result.ok) revalidatePath("/dashboard");
  return result;
}

export async function requestFacultyAccessAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction("requestFacultyAccess", async () => {
    await requestFacultyAccess(await requireActor("STUDENT"), { department: String(form.get("department") ?? "") }, await requestMeta());
  });
  if (result.ok) revalidatePath("/faculty-access");
  return result;
}

// ── Faculty ───────────────────────────────────────────────────────────────

export async function createClassAction(
  _prev: ActionResult<{ classId: string }> | null,
  form: FormData,
): Promise<ActionResult<{ classId: string }>> {
  const result = await runAction("createClass", async () => {
    const actor = await requireActor("FACULTY");
    return createClass(actor, Object.fromEntries(form), await requestMeta());
  });
  if (result.ok) {
    revalidatePath("/dashboard");
    redirect(`/classes/${result.data.classId}?created=1`);
  }
  return result;
}

export async function rotateCodeAction(classId: string) {
  const result = await runAction("rotateCode", async () => rotateCode(await requireActor("FACULTY"), classId, await requestMeta()));
  if (result.ok) revalidatePath(`/classes/${classId}`);
  return result;
}

export async function revokeCodeAction(classId: string) {
  const result = await runAction("revokeCode", async () => revokeCode(await requireActor("FACULTY"), classId, await requestMeta()));
  if (result.ok) revalidatePath(`/classes/${classId}`);
  return result;
}

export async function setExpiryAction(classId: string, option: string) {
  const result = await runAction("setExpiry", async () => setCodeExpiry(await requireActor("FACULTY"), classId, option, await requestMeta()));
  if (result.ok) revalidatePath(`/classes/${classId}`);
  return result;
}

export async function removeStudentAction(classId: string, enrollmentId: string) {
  const result = await runAction("removeStudent", async () =>
    removeStudent(await requireActor("FACULTY"), classId, enrollmentId, await requestMeta()),
  );
  if (result.ok) revalidatePath(`/classes/${classId}`);
  return result;
}

// ── Admin ─────────────────────────────────────────────────────────────────

export async function decideFacultyAction(id: string, decision: "approve" | "reject" | "revoke") {
  const result = await runAction("decideFaculty", async () => decideFacultyAccess(await requireActor("ADMIN"), id, decision, await requestMeta()));
  if (result.ok) revalidatePath("/admin");
  return result;
}

export async function addFacultyAction(_prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  const result = await runAction("addFaculty", async () => {
    await addFacultyEmail(
      await requireActor("ADMIN"),
      { email: String(form.get("email") ?? ""), department: String(form.get("department") ?? "") },
      await requestMeta(),
    );
  });
  if (result.ok) revalidatePath("/admin");
  return result;
}

// ── Documents (Phase 2) ───────────────────────────────────────────────────

export async function submitDocumentAction(documentId: string, versionId: string) {
  const result = await runAction("submitDocument", async () =>
    submitDocument(await requireActor("STUDENT"), documentId, versionId, await requestMeta()),
  );
  if (result.ok) revalidatePath(`/documents/${documentId}`);
  return result;
}

export async function decideDocumentAction(documentId: string, input: { versionId: string; decision: "REJECT" | "REQUEST_CORRECTIONS"; reason: string }) {
  const result = await runAction("decideDocument", async () =>
    decideDocument(await requireActor("FACULTY"), documentId, input, await requestMeta()),
  );
  if (result.ok) revalidatePath(`/review/${documentId}`);
  return result;
}

// ── Signing (Phase 3) ─────────────────────────────────────────────────────

export async function approveAndSignAction(documentId: string, input: { versionId: string; expectedSha256: string; confirm: boolean }) {
  const result = await runAction("approveAndSign", async () =>
    approveAndSign(await requireActor("FACULTY"), documentId, input, await requestMeta()),
  );
  if (result.ok) revalidatePath(`/review/${documentId}`);
  return result;
}

export async function createCredentialAction() {
  const result = await runAction("createCredential", async () => {
    await createCredential(await requireActor("FACULTY"), await requestMeta());
  });
  if (result.ok) revalidatePath("/signing");
  return result;
}

export async function rotateCredentialAction() {
  const result = await runAction("rotateCredential", async () => {
    await rotateCredential(await requireActor("FACULTY"), await requestMeta());
  });
  if (result.ok) revalidatePath("/signing");
  return result;
}

export async function revokeCredentialAction(credentialId: string, reason: string) {
  const result = await runAction("revokeCredential", async () =>
    revokeCredential(await requireActor("FACULTY", "ADMIN"), credentialId, reason, await requestMeta()),
  );
  if (result.ok) revalidatePath("/signing");
  return result;
}

/** Public: no session needed. Only a hash leaves the browser. */
export async function verifyHashAction(sha256: string) {
  return runAction("verifyHash", () => verifyHash(String(sha256).slice(0, 80)));
}
