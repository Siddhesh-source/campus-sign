/**
 * Ledger operations CLI.
 *   pnpm ledger:relay [--once]   deliver queued events to Fabric (loops every 5s)
 *   pnpm ledger:reconcile        compare Postgres with the ledger, record mismatches
 *   pnpm ledger:smoke            write + read a probe event directly against Fabric
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { getLedger } from "@/server/ledger/client";
import { relayDue } from "@/server/ledger/relay";
import { reconcile } from "@/server/ledger/reconcile";
import { db } from "@/server/db";

const [cmd, flag] = process.argv.slice(2);

async function main() {
  if (cmd === "relay") {
    for (;;) {
      const out = await relayDue({ limit: 100 });
      if (out.length) console.log(new Date().toISOString(), JSON.stringify(out));
      if (flag === "--once") break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
  } else if (cmd === "reconcile") {
    console.log(JSON.stringify(await reconcile(), null, 2));
  } else if (cmd === "smoke") {
    // Probe the isolated test namespace so smoke events never pollute app state.
    process.env.FABRIC_CHAINCODE = "campussign-it";
    const ledger = await getLedger();
    if (!ledger) throw new Error("LEDGER_MODE is off");
    const ev = { eventId: randomUUID(), type: "KEY_REVOKED" as const, signerKeyId: "ed25519:0000000000000000", occurredAt: new Date().toISOString() };
    const first = await ledger.record(ev);
    const replay = await ledger.record(ev);
    console.log({ first: first.status, block: String(first.blockNumber), replay: replay.status, sameTx: first.txId === replay.txId });
    console.log("read back:", await ledger.getEvent(ev.eventId));
  } else {
    console.log("usage: ledger relay [--once] | reconcile | smoke");
  }
}

main()
  .then(() => db.$disconnect())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
