/**
 * Pilot seed (idempotent). Verifies two demo faculty and adds a two-step
 * document type so every flow can be exercised right after setup.
 *   pnpm db:seed
 * Sign in with the dev presets (or these emails) on /sign-in afterwards.
 */
import "dotenv/config";
import { db } from "@/server/db";

const FACULTY = [
  { email: "ananya.kulkarni@vit.edu", department: "Computer Engineering" },
  { email: "hod.cs@vit.edu", department: "Computer Engineering (HoD)" },
];

async function main() {
  for (const f of FACULTY) {
    await db.facultyAccess.upsert({
      where: { email: f.email },
      create: { ...f, status: "APPROVED", decidedAt: new Date() },
      update: { status: "APPROVED", department: f.department },
    });
  }
  const noc = await db.documentType.upsert({
    where: { code: "INTERNSHIP_NOC" },
    create: { code: "INTERNSHIP_NOC", name: "Internship NOC" },
    update: {},
  });
  if (!(await db.approvalStep.count({ where: { typeId: noc.id } }))) {
    await db.approvalStep.createMany({
      data: [
        { typeId: noc.id, order: 1, label: "Class faculty", kind: "CLASS_FACULTY" },
        { typeId: noc.id, order: 2, label: "Head of Department", kind: "DESIGNATED", approverEmail: "hod.cs@vit.edu" },
      ],
    });
  }
  await db.auditEvent.create({ data: { actorEmail: "ops@seed", action: "ops.seed", metadata: { faculty: FACULTY.length, types: ["INTERNSHIP_NOC"] } } });
  console.log("Seeded: 2 verified faculty (ananya.kulkarni@vit.edu, hod.cs@vit.edu) and Internship NOC (class faculty → HoD).");
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
