import { expect, test } from "@playwright/test";
import { checkScreen, makePdf, signIn } from "./helpers";

/**
 * The whole MVP, through the real UI, with an accessibility + mobile-layout
 * check on every screen it touches:
 *   admin configures a two-step route → faculty creates a class → student joins
 *   and submits → class faculty signs (step 1) → HoD signs (step 2) → student
 *   downloads → anyone verifies (fully verified) → tamper fails → key revoked
 *   fails → audit trail and personal activity show what happened.
 */
test("full pilot journey", async ({ browser }, info) => {
  test.setTimeout(360_000);
  const run = `${Date.now()}${info.project.name === "phone" ? "p" : "d"}`;
  const facultyEmail = `journey.fac.${run}@vit.edu`;
  const hodEmail = `journey.hod.${run}@vit.edu`;
  const studentEmail = `journey.stu.${run}@vit.edu`;
  const typeName = `Journey NOC ${run}`;
  const typeCode = `JOURNEY_${run.toUpperCase()}`;

  // ── Admin: verify faculty, create a document type with a two-step route ──
  const admin = await signIn(browser, "admin@vit.edu", "Registrar Admin");
  await admin.goto("/admin");
  await checkScreen(admin, "admin/faculty");
  for (const email of [facultyEmail, hodEmail]) {
    await admin.getByLabel("Institute email").fill(email);
    await admin.getByRole("button", { name: "Add as verified faculty" }).click();
    await expect(admin.getByText(email)).toBeVisible();
  }
  await admin.goto("/admin/document-types");
  await checkScreen(admin, "admin/document-types");
  await admin.getByLabel("Name", { exact: true }).last().fill(typeName);
  await admin.getByLabel("Code").fill(typeCode);
  await admin.getByRole("button", { name: "Add document type" }).click();
  const row = admin.getByRole("listitem").filter({ has: admin.getByRole("heading", { name: typeName }) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Edit" }).click();
  await row.getByRole("button", { name: "Add a step" }).click();
  await row.getByLabel("Step 2 approver email").fill(hodEmail);
  await row.getByRole("button", { name: "Save changes" }).click();
  await expect(row.getByText(hodEmail)).toBeVisible();
  await checkScreen(admin, "admin/document-types (with route)");

  // ── Faculty: signing key, class ──
  const faculty = await signIn(browser, facultyEmail, "Journey Faculty");
  await faculty.goto("/signing");
  await faculty.getByRole("button", { name: "Create signing key" }).click();
  await expect(faculty.getByText("Active key")).toBeVisible();
  await checkScreen(faculty, "faculty/signing");
  await faculty.goto("/classes/new");
  await checkScreen(faculty, "faculty/new-class");
  await faculty.getByLabel("Class name").fill(`Journey ${run}`);
  await faculty.getByLabel("Subject code").fill("CS4101");
  await faculty.getByLabel("Division").fill("A");
  await faculty.getByRole("button", { name: "Create class and code" }).click();
  await expect(faculty.getByText("Class created.")).toBeVisible({ timeout: 20_000 });
  await checkScreen(faculty, "faculty/class");
  const code = (await faculty.getByLabel(/^Class code /).getAttribute("aria-label"))!.replace("Class code ", "");

  // ── Student: join, submit ──
  const student = await signIn(browser, studentEmail, "Journey Student");
  await student.goto("/dashboard");
  await checkScreen(student, "student/dashboard (empty)");
  await student.goto(`/join?code=${code}`);
  await expect(student.getByRole("heading", { name: "Is this your class?" })).toBeVisible({ timeout: 20_000 });
  await checkScreen(student, "student/join preview");
  await student.getByRole("button", { name: "Join class" }).click();
  await expect(student.getByRole("heading", { name: "You're in" })).toBeVisible();
  await student.goto("/documents/new");
  await checkScreen(student, "student/new-document");
  await student.getByLabel("Document type").selectOption({ label: typeName });
  await student.getByLabel("Title").fill(`Internship at Acme ${run}`);
  await student.locator('input[type="file"]').setInputFiles({ name: "noc.pdf", mimeType: "application/pdf", buffer: await makePdf(`NOC ${run}`) });
  await student.getByRole("button", { name: "Upload and preview" }).click();
  await expect(student.getByRole("heading", { name: "Ready to submit?" })).toBeVisible({ timeout: 30_000 });
  await checkScreen(student, "student/document (draft)");
  await student.getByRole("button", { name: "Submit for review" }).click();
  await expect(student.getByRole("heading", { name: "Waiting for review" })).toBeVisible();
  const docUrl = student.url().split("?")[0];

  // ── Step 1: class faculty ──
  await faculty.goto("/inbox");
  await checkScreen(faculty, "faculty/inbox");
  await faculty.getByRole("link", { name: `Internship at Acme ${run}` }).click();
  await expect(faculty.getByText("exact submitted file")).toBeVisible();
  await checkScreen(faculty, "faculty/review");
  await faculty.getByRole("button", { name: "Approve", exact: true }).click();
  await faculty.getByRole("checkbox").check();
  await faculty.getByRole("button", { name: "Approve and sign" }).click();
  await expect(faculty.getByRole("heading", { name: "Waiting for Head of Department" })).toBeVisible();

  // ── Step 2: HoD ──
  const hod = await signIn(browser, hodEmail, "Journey HoD");
  await hod.goto("/signing");
  await hod.getByRole("button", { name: "Create signing key" }).click();
  await expect(hod.getByText("Active key")).toBeVisible();
  await hod.goto("/inbox");
  await hod.getByRole("link", { name: `Internship at Acme ${run}` }).click();
  await hod.getByRole("button", { name: "Approve", exact: true }).click();
  await hod.getByRole("checkbox").check();
  await hod.getByRole("button", { name: "Approve and sign" }).click();
  await expect(hod.getByRole("heading", { name: "Approved and signed" })).toBeVisible();

  // ── Student: approved, download ──
  await student.goto(docUrl);
  await expect(student.getByText("Approved & signed")).toBeVisible();
  await checkScreen(student, "student/document (approved)");
  const href = await student.getByRole("link", { name: "Download signed PDF" }).getAttribute("href");
  const signed = Buffer.from(await (await student.request.get(href!)).body());
  expect(signed.subarray(0, 5).toString()).toBe("%PDF-");

  // ── Anyone: verify ──
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/verify");
  await checkScreen(anon, "public/verify");
  await expect(async () => {
    await anon.getByLabel("Choose a PDF to verify").setInputFiles({ name: "signed.pdf", mimeType: "application/pdf", buffer: signed });
    await expect(anon.getByRole("heading", { name: "Fully verified" })).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
  await expect(anon.getByText("Head of Department · Journey HoD")).toBeVisible();
  await expect(anon.getByText("Journey Student")).toHaveCount(0);
  await checkScreen(anon, "public/verify (fully verified)");

  const tampered = Buffer.from(signed);
  tampered[Math.floor(tampered.length / 3)] ^= 0x20;
  await anon.getByLabel("Choose a PDF to verify").setInputFiles({ name: "tampered.pdf", mimeType: "application/pdf", buffer: tampered });
  await expect(anon.getByRole("heading", { name: "Not verified" })).toBeVisible();

  // ── Admin: revoke the HoD's key → the document stops verifying ──
  await admin.goto(`/admin/credentials?q=${encodeURIComponent(hodEmail)}`);
  await checkScreen(admin, "admin/credentials");
  admin.once("dialog", (d) => d.accept("E2E: compromise drill"));
  await admin.getByRole("button", { name: "Revoke" }).click();
  await expect(admin.getByText("compromise drill")).toBeVisible();
  await anon.getByLabel("Choose a PDF to verify").setInputFiles({ name: "signed.pdf", mimeType: "application/pdf", buffer: signed });
  await expect(anon.getByRole("heading", { name: "Signature revoked" })).toBeVisible();

  // ── Records: admin audit (filter + CSV) and personal activity ──
  await admin.goto(`/admin/audit?action=document.approve_sign&actor=${encodeURIComponent(hodEmail)}`);
  await checkScreen(admin, "admin/audit (filtered)");
  await expect(admin.getByRole("cell", { name: "document.approve_sign" }).first()).toBeVisible();
  const csv = await admin.request.get(`/api/admin/audit?action=credential.revoke`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(await csv.text()).toContain("compromise drill");
  expect((await anon.request.get("/api/admin/audit")).status()).toBe(404);

  await hod.goto("/activity?action=document.");
  await checkScreen(hod, "faculty/activity");
  await expect(hod.getByRole("cell", { name: "document.approve_sign" }).first()).toBeVisible();
});

test("signed-out and role-gated screens pass accessibility checks", async ({ browser }) => {
  const anon = await (await browser.newContext()).newPage();
  for (const path of ["/sign-in", "/verify", "/denied", "/verify/CS-AAAA-BBBB-CCCC"]) {
    await anon.goto(path);
    await checkScreen(anon, `public${path}`);
  }
  const student = await signIn(browser, `a11y.${Date.now()}@vit.edu`, "Accessibility Student");
  for (const path of ["/dashboard", "/join", "/documents", "/documents/new", "/faculty-access", "/activity"]) {
    await student.goto(path);
    await checkScreen(student, `student${path}`);
  }
  const admin = await signIn(browser, "admin@vit.edu", "Registrar Admin");
  for (const path of ["/admin/ledger", "/admin/audit"]) {
    await admin.goto(path);
    await checkScreen(admin, `admin${path}`);
  }
});
