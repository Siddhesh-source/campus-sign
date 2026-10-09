"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { leaveClassAction } from "@/app/actions";

export function JoinField() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return (
    <form
      className="grid gap-2 sm:grid-cols-[1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) router.push(`/join?code=${encodeURIComponent(code.trim())}`);
      }}
    >
      <label htmlFor="home-code" className="sr-only">
        Class code
      </label>
      <input
        id="home-code"
        className="input input-code !text-[17px] text-center sm:text-left"
        placeholder="VIT-CS26-K7P9Q"
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <button type="submit" className="btn btn-primary min-h-[46px]" disabled={!code.trim()}>
        Look up class
      </button>
    </form>
  );
}

export function LeaveButton({ enrollmentId, className }: { enrollmentId: string; className: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end">
      <button
        type="button"
        className="btn btn-ghost btn-sm text-muted"
        disabled={pending}
        onClick={() => {
          if (!window.confirm(`Leave ${className}? You can rejoin later with a valid code.`)) return;
          start(async () => {
            const res = await leaveClassAction(enrollmentId);
            if (!res.ok) setError(res.error);
          });
        }}
      >
        {pending ? "Leaving…" : "Leave"}
      </button>
      {error && (
        <span className="field-error" role="alert">
          {error}
        </span>
      )}
    </span>
  );
}
