import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import type { CurrentUser, Role } from "@/server/auth";

let n = 0;

export async function makeUser(role: Role = "STUDENT", name = `User ${++n}`): Promise<CurrentUser> {
  const email = `${name.toLowerCase().replace(/[^a-z0-9]+/g, ".")}.${n}@vit.edu`;
  const user = await db.user.create({ data: { id: randomUUID(), name, email, emailVerified: true } });
  if (role === "FACULTY") await db.facultyAccess.create({ data: { email, status: "APPROVED" } });
  return { id: user.id, email, name, image: null, role, facultyStatus: role === "FACULTY" ? "APPROVED" : null };
}

export const meta = (ip = `10.0.0.${++n % 250}`) => ({ ip, userAgent: "vitest" });

export const validClass = {
  name: "Data Structures & Algorithms",
  subjectCode: "CS2101",
  academicYear: "2026-27",
  yearOfStudy: "SY",
  division: "B",
  description: "",
  studentLimit: "60",
  codeExpiry: "7",
};

import { PDFDocument, StandardFonts } from "pdf-lib";

export async function makePdf(text = "Lab report", pages = 1): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) doc.addPage([595, 842]).drawText(`${text} p${i + 1}`, { x: 50, y: 780, size: 14, font });
  return doc.save();
}

export const LAB_REPORT = "dt_lab_report";
