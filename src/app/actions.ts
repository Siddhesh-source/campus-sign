"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requestMeta, requireActor } from "@/server/auth";
import { runAction, type ActionResult } from "@/server/errors";
import { createClass, removeStudent, revokeCode, rotateCode, setCodeExpiry } from "@/server/classes";
import { joinClass, leaveClass, lookupCode, type ClassPreview } from "@/server/enrollment";
import { addFacultyEmail, decideFacultyAccess, requestFacultyAccess } from "@/server/faculty";

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
