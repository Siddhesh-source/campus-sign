import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { createPrivateKey } from "node:crypto";
import * as grpc from "@grpc/grpc-js";
import { connect, hash, signers, type Contract, type Gateway } from "@hyperledger/fabric-gateway";
import type { LedgerEventInput, StoredLedgerEvent } from "@ledger-core";
import { log } from "../log";
import { LedgerConflictError, LedgerUnavailableError, type LedgerClient, type RecordResult } from "./client";

/**
 * Hyperledger Fabric client via the Fabric Gateway (gRPC + TLS), acting as the
 * Org1 application identity. One connection per process.
 */
export async function createFabricLedger(): Promise<LedgerClient> {
  const env = (k: string, d?: string) => {
    const v = process.env[k] ?? d;
    if (!v) throw new LedgerUnavailableError(`${k} is not set`);
    return v;
  };
  const cryptoPath = path.resolve(/* turbopackIgnore: true */ process.cwd(), env("FABRIC_CRYPTO_PATH"));
  const userDir = path.join(cryptoPath, "users", env("FABRIC_USER", "User1@org1.example.com"), "msp");
  const certDir = path.join(userDir, "signcerts");
  const keyDir = path.join(userDir, "keystore");
  const tlsCert = path.join(cryptoPath, "peers", env("FABRIC_PEER_HOST_ALIAS", "peer0.org1.example.com"), "tls", "ca.crt");

  const [certFile] = await readdir(certDir);
  const [keyFile] = await readdir(keyDir);
  const credentials = await readFile(path.join(certDir, certFile));
  const privateKey = createPrivateKey(await readFile(path.join(keyDir, keyFile)));

  const client = new grpc.Client(env("FABRIC_PEER_ENDPOINT", "localhost:7051"), grpc.credentials.createSsl(await readFile(tlsCert)), {
    "grpc.ssl_target_name_override": env("FABRIC_PEER_HOST_ALIAS", "peer0.org1.example.com"),
  });
  const gateway: Gateway = connect({
    client,
    identity: { mspId: env("FABRIC_MSP_ID", "Org1MSP"), credentials },
    signer: signers.newPrivateKeySigner(privateKey),
    hash: hash.sha256,
    evaluateOptions: () => ({ deadline: Date.now() + 5_000 }),
    endorseOptions: () => ({ deadline: Date.now() + 15_000 }),
    submitOptions: () => ({ deadline: Date.now() + 5_000 }),
    commitStatusOptions: () => ({ deadline: Date.now() + 60_000 }),
  });
  const contract: Contract = gateway.getNetwork(env("FABRIC_CHANNEL", "campussign")).getContract(env("FABRIC_CHAINCODE", "campussign"));
  const utf8 = new TextDecoder();

  async function evaluate<T>(fn: string, ...args: string[]): Promise<T> {
    try {
      return JSON.parse(utf8.decode(await contract.evaluateTransaction(fn, ...args))) as T;
    } catch (err) {
      throw new LedgerUnavailableError(`evaluate ${fn} failed: ${describe(err)}`);
    }
  }

  return {
    name: "fabric",
    async record(event: LedgerEventInput): Promise<RecordResult> {
      let submitted;
      try {
        submitted = await contract.submitAsync("RecordEvent", { arguments: [JSON.stringify(event)] });
      } catch (err) {
        const msg = describe(err);
        if (msg.includes("CONFLICT")) throw new LedgerConflictError(msg);
        throw new LedgerUnavailableError(`submit failed: ${msg}`);
      }
      const status = await submitted.getStatus();
      if (!status.successful) throw new LedgerUnavailableError(`transaction ${status.transactionId} not committed: code ${status.code}`);
      const result = JSON.parse(utf8.decode(submitted.getResult())) as { status: "CREATED" | "REPLAYED"; event: StoredLedgerEvent };
      log.info({ eventId: event.eventId, txId: status.transactionId, block: String(status.blockNumber), outcome: result.status }, "ledger record");
      return {
        status: result.status,
        event: result.event,
        txId: result.event.txId,
        blockNumber: result.status === "CREATED" ? status.blockNumber : null,
      };
    },
    getEvent: (id) => evaluate<StoredLedgerEvent | null>("GetEvent", id),
    getByHash: (sha) => evaluate<StoredLedgerEvent[]>("GetEventsByHash", sha),
    getByKey: (keyId) => evaluate<StoredLedgerEvent[]>("GetEventsByKey", keyId),
    listAll: () => evaluate<StoredLedgerEvent[]>("ListEvents"),
  };
}

function describe(err: unknown): string {
  if (err && typeof err === "object" && "details" in err && Array.isArray((err as { details: unknown[] }).details)) {
    const d = (err as { details: { message?: string }[]; message?: string }).details.map((x) => x.message).join("; ");
    return `${(err as unknown as Error).message}${d ? ` (${d})` : ""}`;
  }
  return err instanceof Error ? err.message : String(err);
}
