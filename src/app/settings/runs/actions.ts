"use server";

import { revalidatePath } from "next/cache";
import { installSchedule, removeSchedule, startFetchNow } from "@/lib/automation";
import { getRunningFetch } from "@/lib/fetch-run";
import { setSetting } from "@/lib/settings";

export type ActionState = { error?: string; message?: string };

const done = () => revalidatePath("/settings/runs");

async function attempt(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    done();
    return { message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runNowAction(): Promise<ActionState> {
  return attempt(async () => {
    if (await getRunningFetch()) throw new Error("A fetch is already running");
    startFetchNow();
    // Give the new process a moment to register its run so the page shows it as running.
    await new Promise((r) => setTimeout(r, 4000));
    return "Fetch started. This page refreshes while it runs.";
  });
}

export async function installScheduleAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return attempt(async () => {
    const time = String(formData.get("time") ?? "09:30");
    await installSchedule(time);
    await setSetting("fetch.scheduleTime", time);
    return `Automatic fetch is on: checked daily at ${time}.`;
  });
}

export async function removeScheduleAction(): Promise<ActionState> {
  return attempt(async () => {
    await removeSchedule();
    return "Automatic fetch is off.";
  });
}

const NUMBER_SETTINGS: Record<string, [min: number, max: number]> = {
  "fetch.intervalDays": [1, 14],
  "fetch.maxRequestsPerRun": [1, 50],
  "filter.minFitScore": [0, 100],
  "filter.minRequiredYears": [0, 30],
  "filter.maxAgeDays": [1, 90],
};

export async function saveSettingsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return attempt(async () => {
    for (const [key, [min, max]] of Object.entries(NUMBER_SETTINGS)) {
      const value = Number(formData.get(key));
      if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be a whole number from ${min} to ${max}`);
      await setSetting(key, String(value));
    }
    const datePosted = String(formData.get("fetch.datePosted"));
    if (!["3days", "week", "month"].includes(datePosted)) throw new Error("Unknown posting window");
    await setSetting("fetch.datePosted", datePosted);
    return "Settings saved.";
  });
}
