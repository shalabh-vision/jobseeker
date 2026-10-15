"use server";

import { revalidatePath } from "next/cache";
import { refreshCities } from "@/lib/career/cities";
import { refreshSwot } from "@/lib/career/swot";

export type RefreshState = { error?: string; message?: string };

async function attempt(work: () => Promise<string>, paths: string[]): Promise<RefreshState> {
  try {
    const message = await work();
    for (const p of paths) revalidatePath(p);
    return { message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

/** Recounts postings per city and reloads the World Bank figures (7 small requests). */
export async function refreshCitiesAction(): Promise<RefreshState> {
  return attempt(async () => `Updated ${(await refreshCities()).length} cities.`, ["/career-map"]);
}

/** Recounts the evidence and asks Gemini once for the SWOT, role and how-to-overcome. */
export async function refreshSwotAction(): Promise<RefreshState> {
  return attempt(async () => {
    await refreshSwot();
    return "SWOT updated.";
  }, ["/swot", "/career-map"]);
}
