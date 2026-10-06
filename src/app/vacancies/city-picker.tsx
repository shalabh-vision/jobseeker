"use client";

import { useActionState } from "react";
import { formatDate } from "@/lib/format";
import { runCitiesAction } from "./actions";

export type PickableCity = { city: string; queries: number; lastRunAt: Date | null };

/** Other cities are searched only on request, to save the JSearch monthly allowance. */
export function CityPicker({ cities, running, remaining }: { cities: PickableCity[]; running: boolean; remaining: number | null }) {
  const [state, run, pending] = useActionState(runCitiesAction, {});
  return (
    <form action={run} className="space-y-3">
      <ul className="flex flex-wrap gap-2">
        {cities.map((c) => (
          <li key={c.city}>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
              <input type="checkbox" name="city" value={c.city} />
              {c.city}
              <span className="text-xs text-gray-500">
                {c.lastRunAt ? `searched ${formatDate(c.lastRunAt)}` : "never searched"}
                {c.queries > 1 && ` · ${c.queries} requests`}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <button
          className="rounded-md bg-accent-500 shadow-sm px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-60"
          disabled={pending || running}
        >
          {running ? "Fetch running…" : pending ? "Starting…" : "Search ticked cities now"}
        </button>
        <span className="text-xs text-gray-500">
          One JSearch request per city unless shown
          {remaining !== null && <> · {remaining} left this month (at the last fetch)</>}
        </span>
      </div>
      {state.error && <p className="text-sm text-red-700">{state.error}</p>}
      {state.message && <p className="text-sm text-green-700">{state.message}</p>}
    </form>
  );
}
