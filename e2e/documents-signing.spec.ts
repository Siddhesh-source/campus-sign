import { expect, test, type Browser, type Page } from "@playwright/test";
import { PDFDocument, StandardFonts } from "pdf-lib";

// Phase 2 + 3 done criteria: a student submits a PDF, the faculty member
// reviews that exact version and signs; the signed PDF verifies publicly and
// a single changed byte fails.

async function signIn(browser: Browser, email: string, name: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  const res = await page.request.post("/api/auth/dev/sign-in", { data: { email, name } });
  expect(res.ok()).toBeTruthy();
  return page;
}

async function makePdf(text: string) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  doc.addPage([595, 842]).drawText(text, { x: 50, y: 780, size: 16, font });
  return Buffer.from(await doc.save());
}

test("student submits, faculty signs, anyone verifies", async ({ browser }, info) => {
  test.setTimeout(120_000);
  const run = `${Date.now()}${info.project.name}`;
  const facultyEmail = `signer.${run}@vit.edu`;
  const studentEmail = `submitter.${run}@vit.edu`;

  const admin = await signIn(browser, "admin@vit.edu", "Registrar Admin");
  await admin.goto("/admin");
  await admin.getByLabel("Institute email").fill(facultyEmail);
  await admin.getByRole("button", { name: "Add as verified faculty" }).click();
  await expect(admin.getByText(facultyEmail)).toBeVisible();

  // Faculty: signing key + class.
  const faculty = await signIn(browser, facultyEmail, "Prof Signer");
  await faculty.goto("/signing");
  await faculty.getByRole("button", { name: "Create signing key" }).click();
  await expect(faculty.getByText("Active key")).toBeVisible();
  await faculty.goto("/classes/new");
  await faculty.getByLabel("Class name").fill(`Signing ${run}`);
  await faculty.getByLabel("Subject code").fill("CS3101");
  await faculty.getByLabel("Division").fill("A");
  await faculty.getByRole("button", { name: "Create class and code" }).click();
  await expect(faculty.getByText("Class created.")).toBeVisible();
  const code = (await faculty.getByLabel(/^Class code /).getAttribute("aria-label"))!.replace("Class code ", "");

  // Student: join, upload, preview, submit.
  const student = await signIn(browser, studentEmail, "Sub Mitter");
  await student.goto(`/join?code=${code}`);
  await student.getByRole("button", { name: "Join class" }).click();
  await expect(student.getByRole("heading", { name: "You're in" })).toBeVisible();

  await student.goto("/documents/new");
  await student.getByLabel("Document type").selectOption({ label: "Lab report" });
  await student.getByLabel("Title").fill(`Lab ${run}`);
  await student.locator('input[type="file"]').setInputFiles({ name: "lab.pdf", mimeType: "application/pdf", buffer: await makePdf(`Lab ${run}`) });
  await student.getByRole("button", { name: "Upload and preview" }).click();
  await expect(student.getByRole("heading", { name: "Ready to submit?" })).toBeVisible();
  await expect(student.locator("iframe")).toBeVisible();
  await student.getByRole("button", { name: "Submit for review" }).click();
  await expect(student.getByRole("heading", { name: "Waiting for review" })).toBeVisible();

  // Faculty: inbox → review → approve & sign.
  await faculty.goto("/inbox");
  await faculty.getByRole("link", { name: `Lab ${run}` }).click();
  await expect(faculty.getByText("exact submitted file")).toBeVisible();
  await faculty.getByRole("button", { name: "Approve", exact: true }).click();
  await faculty.getByRole("checkbox").check();
  await faculty.getByRole("button", { name: "Approve and sign" }).click();
  await expect(faculty.getByRole("heading", { name: "Approved and signed" })).toBeVisible();

  // Student: download the signed PDF.
  await student.reload();
  await expect(student.getByText("Approved & signed")).toBeVisible();
  const href = await student.getByRole("link", { name: "Download signed PDF" }).getAttribute("href");
  const signed = Buffer.from(await (await student.request.get(href!)).body());
  expect(signed.subarray(0, 5).toString()).toBe("%PDF-");

  // Public, logged-out verification.
  const anon = await (await browser.newContext()).newPage();
  await anon.goto("/verify");
  await anon.getByLabel("Choose a PDF to verify").setInputFiles({ name: "signed.pdf", mimeType: "application/pdf", buffer: signed });
  await expect(anon.getByRole("heading", { name: "Valid signature" })).toBeVisible();
  await expect(anon.getByText("Prof Signer")).toBeVisible();
  await expect(anon.getByText("Sub Mitter")).toHaveCount(0);
  await expect(anon.getByText(studentEmail)).toHaveCount(0);

  const tampered = Buffer.from(signed);
  tampered[Math.floor(tampered.length / 2)] ^= 0x01;
  await anon.getByLabel("Choose a PDF to verify").setInputFiles({ name: "tampered.pdf", mimeType: "application/pdf", buffer: tampered });
  await expect(anon.getByRole("heading", { name: "Not verified" })).toBeVisible();
});

test("files are private: another student gets 404", async ({ browser }) => {
  const outsider = await signIn(browser, `outsider.${Date.now()}@vit.edu`, "Out Sider");
  const res = await outsider.request.get("/api/files/does-not-exist");
  expect(res.status()).toBe(404);
  const anon = await (await browser.newContext()).newPage();
  expect((await anon.request.get("/api/files/does-not-exist")).status()).toBe(404);
});
