"use client";

import { useActionState } from "react";
import { refineAction } from "./actions";

export function RefineButton({ stale }: { stale: boolean }) {
  const [state, refine, pending] = useActionState(refineAction, {});
  return (
    <form action={refine} className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent-500 shadow-sm px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Refining…" : stale ? "Refine queries now" : "Refine again"}
      </button>
      {pending && <span className="text-sm text-gray-600">Gemini is rewriting the queries; this takes 30–60 seconds.</span>}
      {!pending && state.error && <span className="text-sm text-red-700">{state.error}</span>}
      {!pending && state.message && <span className="text-sm text-green-700">{state.message}</span>}
    </form>
  );
}
