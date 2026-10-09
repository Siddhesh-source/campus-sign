import { afterAll, beforeEach } from "vitest";
import { db } from "@/server/db";

// audit_event rejects TRUNCATE via trigger; replica mode skips user triggers for cleanup only.
beforeEach(async () => {
  await db.$transaction([
    db.$executeRawUnsafe("SET LOCAL session_replication_role = replica"),
    db.$executeRawUnsafe(
      'TRUNCATE "signature","signing_credential","document_event","document_version","document","audit_event","enrollment","class_code","class","faculty_access","code_lookup_limit","session","account","verification","user" CASCADE',
    ),
  ]);
});

afterAll(async () => {
  await db.$disconnect();
});
