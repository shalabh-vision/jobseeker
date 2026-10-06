"use client";

import { useActionState } from "react";
import { runTopPicksAction } from "../actions";

export function RefreshTopPicks({ running, queries }: { running: boolean; queries: number }) {
  const [state, run, pending] = useActionState(runTopPicksAction, {});
  return (
    <form action={run} className="space-y-1">
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-md bg-accent-500 shadow-sm px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-60"
          disabled={pending || running}
        >
          {running ? "Fetch running…" : pending ? "Starting…" : "Search all India now"}
        </button>
        <span className="text-xs text-gray-500">
          {queries} JSearch request{queries === 1 ? "" : "s"}, then Gemini scoring
        </span>
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}
    </form>
  );
}
