import { expect, test, type Page } from "@playwright/test";

// Phase 1 done-criteria: a verified faculty member creates a class and an
// eligible student joins with the code and sees it on their dashboard.

async function devSignIn(page: Page, email: string, name: string) {
  const res = await page.request.post("/api/auth/dev/sign-in", { data: { email, name } });
  expect(res.ok()).toBeTruthy();
}

test("faculty creates a class, student joins with the code", async ({ browser }, info) => {
  const run = `${Date.now()}${info.project.name}`;
  const facultyEmail = `prof.${run}@vit.edu`;
  const studentEmail = `student.${run}@vit.edu`;

  // Admin verifies the faculty email.
  const admin = await (await browser.newContext()).newPage();
  await devSignIn(admin, "admin@vit.edu", "Registrar Admin");
  await admin.goto("/admin");
  await admin.getByLabel("Institute email").fill(facultyEmail);
  await admin.getByRole("button", { name: "Add as verified faculty" }).click();
  await expect(admin.getByText(facultyEmail)).toBeVisible();

  // Faculty creates a class.
  const faculty = await (await browser.newContext()).newPage();
  await devSignIn(faculty, facultyEmail, "Prof Test");
  await faculty.goto("/classes/new");
  await faculty.getByLabel("Class name").fill(`E2E Algorithms ${run}`);
  await faculty.getByLabel("Subject code").fill("CS2101");
  await faculty.getByLabel("Division").fill("B");
  await faculty.getByRole("button", { name: "Create class and code" }).click();
  await expect(faculty.getByText("Class created.")).toBeVisible();
  const code = (await faculty.getByLabel(/^Class code /).getAttribute("aria-label"))!.replace("Class code ", "");
  expect(code).toMatch(/^VIT-CS26-[A-Z2-9]{5}$/);

  // Student: wrong code first, then the real one.
  const student = await (await browser.newContext()).newPage();
  await devSignIn(student, studentEmail, "Test Student");
  await student.goto("/join");
  await student.getByLabel("Class code").fill("VIT-CS26-ZZZZZ");
  await student.getByRole("button", { name: "Look up class" }).click();
  await expect(student.getByText(/doesn't match an open class/)).toBeVisible();

  await student.getByLabel("Class code").fill(code.toLowerCase());
  await student.getByRole("button", { name: "Look up class" }).click();
  await expect(student.getByRole("heading", { name: "Is this your class?" })).toBeVisible();
  await expect(student.getByText("Verified faculty")).toBeVisible();
  await expect(student.getByText(facultyEmail)).toBeVisible();
  await student.getByRole("button", { name: "Join class" }).click();
  await expect(student.getByRole("heading", { name: "You're in" })).toBeVisible();

  await student.getByRole("link", { name: "Go to my classes" }).click();
  await expect(student.getByText(`E2E Algorithms ${run}`)).toBeVisible();

  // Faculty sees the student on the roster.
  await faculty.reload();
  await expect(faculty.getByText(studentEmail)).toBeVisible();
});

test("non-faculty cannot reach class creation", async ({ page }) => {
  await devSignIn(page, `nobody.${Date.now()}@vit.edu`, "Plain Student");
  await page.goto("/classes/new");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("non-VIT accounts are refused by dev sign-in", async ({ page }) => {
  const res = await page.request.post("/api/auth/dev/sign-in", { data: { email: "someone@gmail.com", name: "X" } });
  expect(res.status()).toBe(403);
});
