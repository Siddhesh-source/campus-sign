/**
 * Real Hyperledger Fabric integration test. Runs only with LEDGER_IT=1 and the
 * local network up (`pnpm ledger:up`). Uses the isolated `campussign-it`
 * chaincode namespace so test events never touch the app's ledger state.
 *
 *   LEDGER_IT=1 pnpm test tests/fabric.it.test.ts
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { setLedgerForTests, type LedgerClient } from "@/server/ledger/client";
import { relayDue, relayOne, SimulatedCrash } from "@/server/ledger/relay";
import { createClass } from "@/server/classes";
import { joinClass } from "@/server/enrollment";
import { createDocument, startReview, submitDocument } from "@/server/documents";
import { approveAndSign, createCredential, verifyBytes } from "@/server/signing";
import { getFile } from "@/server/storage";
import { LAB_REPORT, makePdf, makeUser, meta, validClass } from "./helpers";

const RUN = process.env.LEDGER_IT === "1";

describe.skipIf(!RUN)("Hyperledger Fabric (real network)", () => {
  let fabric: LedgerClient;

  beforeAll(async () => {
    Object.assign(process.env, {
      FABRIC_PEER_ENDPOINT: "localhost:7051",
      FABRIC_PEER_HOST_ALIAS: "peer0.org1.example.com",
      FABRIC_MSP_ID: "Org1MSP",
      FABRIC_CRYPTO_PATH: ".fabric/network/organizations/peerOrganizations/org1.example.com",
      FABRIC_CHANNEL: "campussign",
      FABRIC_CHAINCODE: "campussign-it",
    });
    const { createFabricLedger } = await import("@/server/ledger/fabric");
    fabric = await createFabricLedger();
    setLedgerForTests(fabric);
  });
  afterAll(() => setLedgerForTests(undefined));

  async function signed() {
    const fac = await makeUser("FACULTY", "Ananya Kulkarni");
    const student = await makeUser("STUDENT", "Aarav Sharma");
    const { classId, code } = await createClass(fac, validClass, meta());
    await joinClass(student, code, meta());
    const d = await createDocument(student, { classId, typeId: LAB_REPORT, title: "Lab 3" }, { bytes: await makePdf(`it ${Date.now()}`), name: "lab.pdf" }, meta());
    await submitDocument(student, d.documentId, d.versionId, meta());
    await startReview(fac, d.documentId, meta());
    await createCredential(fac, meta());
    const sig = await approveAndSign(fac, d.documentId, { versionId: d.versionId, expectedSha256: d.sha256, confirm: true }, meta());
    const row = await db.signature.findUniqueOrThrow({ where: { id: sig.signatureId } });
    return { ...d, student, sig, pdf: await getFile(row.signedStorageKey) };
  }

  it("records the approval on-chain and verification confirms it", async () => {
    const { pdf, sig, student } = await signed();
    expect((await verifyBytes(pdf)).fullyVerified).toBe(false);

    const out = await relayDue();
    expect(out.map((o) => o.result)).toEqual(["CONFIRMED", "CONFIRMED"]);
    const approved = await db.ledgerOutbox.findFirstOrThrow({ where: { signatureId: sig.signatureId } });
    expect(approved.blockNumber).toBeGreaterThan(BigInt(0));

    const onChain = await fabric.getByHash(sig.signedSha256);
    expect(onChain.map((e) => e.type)).toEqual(["APPROVED"]);
    expect(onChain[0].submitterMsp).toBe("Org1MSP");
    expect(JSON.stringify(onChain)).not.toContain(student.email);

    const res = await verifyBytes(pdf);
    expect(res.ledger!.state).toBe("CONFIRMED");
    expect(res.fullyVerified).toBe(true);
  }, 120_000);

  it("an interrupted submission recovers with no duplicate on-chain event", async () => {
    const { documentId } = await signed();
    await expect(
      relayOne(fabric, {
        afterLedgerCommit: () => {
          throw new SimulatedCrash("killed after commit");
        },
      }),
    ).rejects.toBeInstanceOf(SimulatedCrash);
    expect(await db.ledgerOutbox.count({ where: { documentId, status: "PENDING" } })).toBe(2);

    const out = await relayDue();
    expect(out.map((o) => o.result)).toEqual(["REPLAYED", "CONFIRMED"]);
    const rows = await db.ledgerOutbox.findMany({ where: { documentId } });
    for (const r of rows) expect((await fabric.getEvent(r.id))?.eventId).toBe(r.id);
    expect((await fabric.listAll()).filter((e) => e.documentRef === documentId)).toHaveLength(2);
  }, 120_000);
});
