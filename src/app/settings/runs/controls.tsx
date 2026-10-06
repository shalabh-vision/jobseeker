"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import {
  installScheduleAction,
  removeScheduleAction,
  runNowAction,
  saveSettingsAction,
  type ActionState,
} from "./actions";

const primary = "rounded-md bg-accent-500 shadow-sm px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-60";
const secondary = "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-60";
const input = "w-24 rounded-md border border-gray-300 px-2 py-1 text-sm";

function Result({ state }: { state: ActionState }) {
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.message) return <p className="text-sm text-green-700">{state.message}</p>;
  return null;
}

/** Re-renders the server page every few seconds while a fetch is running. */
export function AutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}

export function RunNowButton({ running }: { running: boolean }) {
  const [state, run, pending] = useActionState(runNowAction, {});
  return (
    <form action={run} className="space-y-1">
      <button className={primary} disabled={pending || running}>
        {running ? "Fetch running…" : pending ? "Starting…" : "Run now"}
      </button>
      <Result state={state} />
    </form>
  );
}

export function ScheduleControls({ installed, time }: { installed: boolean; time: string }) {
  const [installState, install, installing] = useActionState(installScheduleAction, {});
  const [removeState, remove, removing] = useActionState(removeScheduleAction, {});
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <form action={install} className="flex items-center gap-2">
          <label className="text-sm">
            Check daily at <input type="time" name="time" defaultValue={time} className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
          </label>
          <button className={primary} disabled={installing}>
            {installed ? "Update schedule" : "Turn on automatic fetch"}
          </button>
        </form>
        {installed && (
          <form action={remove}>
            <button className={secondary} disabled={removing}>
              Turn off
            </button>
          </form>
        )}
      </div>
      <Result state={installState} />
      <Result state={removeState} />
    </div>
  );
}

export function SettingsForm({ settings }: { settings: Record<string, string> }) {
  const [state, save, pending] = useActionState(saveSettingsAction, {});
  const field = (key: string, label: string, help: string) => (
    <label className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm">
      <span>
        {label}
        <span className="block text-xs text-gray-500">{help}</span>
      </span>
      <input name={key} type="number" defaultValue={settings[key]} className={input} />
    </label>
  );
  return (
    <form action={save}>
      {field("fetch.intervalDays", "Fetch every (days)", "How often the automatic fetch actually searches")}
      {field("fetch.maxRequestsPerRun", "Requests per fetch", "Your JSearch plan allows 200 a month")}
      <label className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 py-2 text-sm">
        <span>
          Postings from the past
          <span className="block text-xs text-gray-500">Should overlap the fetch interval so nothing is missed</span>
        </span>
        <select name="fetch.datePosted" defaultValue={settings["fetch.datePosted"]} className="rounded-md border border-gray-300 px-2 py-1 text-sm">
          <option value="3days">3 days</option>
          <option value="week">week</option>
          <option value="month">month</option>
        </select>
      </label>
      {field("filter.minFitScore", "Minimum fit score", "Lower-scoring jobs go to Filtered out")}
      {field("filter.minRequiredYears", "Minimum years asked", "Postings asking for fewer years count as too junior")}
      {field("filter.maxAgeDays", "Maximum posting age (days)", "Older postings are filtered out")}
      <div className="mt-3 flex items-center gap-3">
        <button className={primary} disabled={pending}>
          Save settings
        </button>
        <Result state={state} />
      </div>
    </form>
  );
}
