"use client";

import { useState, useTransition } from "react";
import { reconcileAction, relayNowAction } from "@/app/actions";

export function LedgerActions() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await relayNowAction();
              setMsg(r.ok ? `Processed ${r.data} queued event${r.data === 1 ? "" : "s"}.` : r.error);
            })
          }
        >
          Deliver pending now
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await reconcileAction();
              setMsg(
                !r.ok
                  ? r.error
                  : r.data.off
                    ? "The ledger is switched off on this server."
                    : `Checked ${r.data.checked} confirmed events against ${r.data.onChain} on-chain: ${r.data.mismatches} mismatch${r.data.mismatches === 1 ? "" : "es"}.`,
              );
            })
          }
        >
          {pending ? "Working…" : "Run reconciliation"}
        </button>
      </div>
      {msg && (
        <p className="text-[13px] text-ink-2" role="status">
          {msg}
        </p>
      )}
    </div>
  );
}
