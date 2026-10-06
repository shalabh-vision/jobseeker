"use server";

import { revalidatePath } from "next/cache";
import { startFetchNow } from "@/lib/automation";
import { getRunningFetch } from "@/lib/fetch-run";
import { listVacancyCities } from "@/lib/vacancies";

export type CityRunState = { error?: string; message?: string };

/** Searches the vacancy queries of the ticked cities now (one JSearch request per query), then scores the results. */
export async function runCitiesAction(_prev: CityRunState, formData: FormData): Promise<CityRunState> {
  try {
    const known = new Set((await listVacancyCities()).map((c) => c.City));
    const cities = formData.getAll("city").map(String).filter((c) => known.has(c));
    if (cities.length === 0) throw new Error("Tick at least one city");
    if (await getRunningFetch()) throw new Error("A fetch is already running");
    startFetchNow(cities);
    // Give the new process a moment to register its run so the page shows it as running.
    await new Promise((r) => setTimeout(r, 4000));
    revalidatePath("/vacancies", "layout");
    return { message: `Searching ${cities.join(", ")}. This page refreshes while it runs.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** TOP 25: searches your roles across India (about one JSearch request per query), then scores and rates. */
export async function runTopPicksAction(): Promise<CityRunState> {
  try {
    if (await getRunningFetch()) throw new Error("A fetch is already running");
    startFetchNow(undefined, true);
    await new Promise((r) => setTimeout(r, 4000));
    revalidatePath("/vacancies", "layout");
    return { message: "Searching all India for your roles. This page refreshes while it runs (a few minutes)." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
