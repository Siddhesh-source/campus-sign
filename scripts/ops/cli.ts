/**
 * Operations CLI (see docs/operations/runbook.md).
 *   pnpm ops:rotate-kek            re-encrypt signing keys from SIGNING_KEK to SIGNING_KEK_NEW
 *   pnpm ops:affected <keyId>      documents signed by a key (compromise response)
 */
import "dotenv/config";
import { db } from "@/server/db";
import { rotateKek } from "@/server/signing";
import { documentsSignedByKey } from "@/server/admin";

const [cmd, arg] = process.argv.slice(2);

async function main() {
  if (cmd === "rotate-kek") {
    const oldKek = process.env.SIGNING_KEK;
    const newKek = process.env.SIGNING_KEK_NEW;
    if (!oldKek || !newKek) throw new Error("Set SIGNING_KEK (current) and SIGNING_KEK_NEW (replacement).");
    const res = await rotateKek(oldKek, newKek);
    console.log(`Re-encrypted ${res.rotated} signing keys. Now set SIGNING_KEK to the new value, restart the app, and destroy the old KEK.`);
  } else if (cmd === "affected") {
    if (!arg) throw new Error("usage: ops:affected <keyId>");
    const res = await documentsSignedByKey(arg);
    if (!res) throw new Error(`No key ${arg}`);
    console.log(`${res.credential.keyId} · ${res.credential.faculty.email} · ${res.credential.status}`);
    for (const s of res.signatures) {
      console.log([s.code, s.signedAt.toISOString(), `${s.stepOrder}/${s.totalSteps}`, s.document.type.name, `${s.document.class.name} ${s.document.class.yearOfStudy} ${s.document.class.division}`, s.document.class.faculty.email].join("\t"));
    }
    console.log(`${res.signatures.length} signature(s).`);
  } else {
    console.log("usage: ops rotate-kek | affected <keyId>");
  }
}

main()
  .then(() => db.$disconnect())
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
