import { Context, Contract, Info, Returns, Transaction } from "fabric-contract-api";
import { canonical, decideRecord, validateEvent, WRITER_MSPS, type StoredLedgerEvent } from "./core";

const EVENT = "event";
const BY_HASH = "hash~event";
const BY_DOC = "doc~event";
const BY_KEY = "key~event";

@Info({ title: "CampusSign", description: "Tamper-evident record of CampusSign document events" })
export class CampusSignContract extends Contract {
  /**
   * Record one event. Idempotent on eventId: an identical replay returns the
   * stored event without writing; a different payload under the same id fails.
   */
  @Transaction()
  @Returns("string")
  public async RecordEvent(ctx: Context, eventJson: string): Promise<string> {
    const msp = ctx.clientIdentity.getMSPID();
    if (!WRITER_MSPS.includes(msp)) throw new Error(`FORBIDDEN: ${msp} may not write events`);

    const input = validateEvent(JSON.parse(eventJson));
    const key = ctx.stub.createCompositeKey(EVENT, [input.eventId]);
    const raw = await ctx.stub.getState(key);
    const existing = raw && raw.length ? (JSON.parse(Buffer.from(raw).toString("utf8")) as StoredLedgerEvent) : null;

    const decision = decideRecord(existing, input);
    if (decision.action === "CONFLICT") throw new Error(`CONFLICT: event ${input.eventId} already recorded with a different payload`);
    if (decision.action === "REPLAY") return canonical({ status: "REPLAYED", event: decision.stored });

    const ts = ctx.stub.getTxTimestamp();
    const seconds = Number(ts.seconds.toString());
    const stored: StoredLedgerEvent = {
      ...input,
      txId: ctx.stub.getTxID(),
      txTimestamp: new Date(seconds * 1000 + Math.floor(ts.nanos / 1e6)).toISOString(),
      submitterMsp: msp,
    };
    await ctx.stub.putState(key, Buffer.from(canonical(stored)));
    const marker = Buffer.from([0]);
    for (const h of [input.sha256, input.signedSha256]) {
      if (h) await ctx.stub.putState(ctx.stub.createCompositeKey(BY_HASH, [h, input.eventId]), marker);
    }
    if (input.documentRef) await ctx.stub.putState(ctx.stub.createCompositeKey(BY_DOC, [input.documentRef, input.eventId]), marker);
    if (input.signerKeyId) await ctx.stub.putState(ctx.stub.createCompositeKey(BY_KEY, [input.signerKeyId, input.eventId]), marker);
    ctx.stub.setEvent("CampusSignEvent", Buffer.from(canonical({ eventId: input.eventId, type: input.type })));
    return canonical({ status: "CREATED", event: stored });
  }

  @Transaction(false)
  @Returns("string")
  public async GetEvent(ctx: Context, eventId: string): Promise<string> {
    const raw = await ctx.stub.getState(ctx.stub.createCompositeKey(EVENT, [eventId]));
    return raw && raw.length ? Buffer.from(raw).toString("utf8") : "null";
  }

  @Transaction(false)
  @Returns("string")
  public async GetEventsByHash(ctx: Context, sha256: string): Promise<string> {
    return this.byIndex(ctx, BY_HASH, sha256);
  }

  @Transaction(false)
  @Returns("string")
  public async GetEventsByDocument(ctx: Context, documentRef: string): Promise<string> {
    return this.byIndex(ctx, BY_DOC, documentRef);
  }

  @Transaction(false)
  @Returns("string")
  public async GetEventsByKey(ctx: Context, signerKeyId: string): Promise<string> {
    return this.byIndex(ctx, BY_KEY, signerKeyId);
  }

  /** Full scan for reconciliation. Fine at campus scale; paginate when it isn't. */
  @Transaction(false)
  @Returns("string")
  public async ListEvents(ctx: Context): Promise<string> {
    const out: unknown[] = [];
    const it = await ctx.stub.getStateByPartialCompositeKey(EVENT, []);
    for (let r = await it.next(); !r.done; r = await it.next()) out.push(JSON.parse(Buffer.from(r.value.value).toString("utf8")));
    await it.close();
    return JSON.stringify(out);
  }

  private async byIndex(ctx: Context, index: string, value: string): Promise<string> {
    const out: unknown[] = [];
    const it = await ctx.stub.getStateByPartialCompositeKey(index, [value]);
    for (let r = await it.next(); !r.done; r = await it.next()) {
      const { attributes } = ctx.stub.splitCompositeKey(r.value.key);
      const raw = await ctx.stub.getState(ctx.stub.createCompositeKey(EVENT, [attributes[1]]));
      if (raw && raw.length) out.push(JSON.parse(Buffer.from(raw).toString("utf8")));
    }
    await it.close();
    return JSON.stringify(out);
  }
}
