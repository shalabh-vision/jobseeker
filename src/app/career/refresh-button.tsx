"use client";

import { useActionState } from "react";
import type { RefreshState } from "./actions";

export function RefreshButton({ action, label, hint }: { action: () => Promise<RefreshState>; label: string; hint: string }) {
  const [state, run, pending] = useActionState(async () => action(), {} as RefreshState);
  return (
    <form action={run} className="space-y-1 text-right">
      <button
        disabled={pending}
        className="rounded-md bg-accent-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-accent-600 disabled:opacity-60"
      >
        {pending ? "Working…" : label}
      </button>
      <p className="text-xs text-gray-500">{hint}</p>
      {state.error && <p className="text-xs text-red-700">{state.error}</p>}
      {state.message && <p className="text-xs text-green-700">{state.message}</p>}
    </form>
  );
}
