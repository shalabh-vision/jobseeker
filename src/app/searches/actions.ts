"use server";

import { revalidatePath } from "next/cache";
import {
  addManualQuery,
  createSavedSearch,
  deleteQuery,
  deleteSavedSearch,
  importSuggestedRoles,
  refineQueries,
  setQueryStatus,
  setSavedSearchActive,
  updateQuery,
  updateSavedSearch,
  type QueryInput,
  type SavedSearchInput,
} from "@/lib/searches";

export type ActionState = { error?: string; message?: string };

const done = () => revalidatePath("/searches");
const id = (formData: FormData) => Number(formData.get("id"));

function savedSearchInput(formData: FormData): SavedSearchInput {
  return {
    roleTitle: String(formData.get("roleTitle") ?? ""),
    keywords: String(formData.get("keywords") ?? ""),
    cities: formData.getAll("cities").map(String),
    workMode: formData.get("workMode") === "remote" ? "remote" : "onsite",
    industries: String(formData.get("industries") ?? ""),
  };
}

function queryInput(formData: FormData): QueryInput {
  return {
    queryText: String(formData.get("queryText") ?? ""),
    location: String(formData.get("location") ?? ""),
    priority: Number(formData.get("priority") ?? 2),
  };
}

export async function addSavedSearchAction(formData: FormData) {
  await createSavedSearch(savedSearchInput(formData));
  done();
}

export async function updateSavedSearchAction(formData: FormData) {
  await updateSavedSearch(id(formData), savedSearchInput(formData));
  done();
}

export async function toggleSavedSearchAction(formData: FormData) {
  await setSavedSearchActive(id(formData), formData.get("active") === "1");
  done();
}

export async function deleteSavedSearchAction(formData: FormData) {
  await deleteSavedSearch(id(formData));
  done();
}

export async function importRolesAction() {
  await importSuggestedRoles();
  done();
}

export async function addQueryAction(formData: FormData) {
  await addManualQuery(queryInput(formData));
  done();
}

export async function updateQueryAction(formData: FormData) {
  await updateQuery(id(formData), queryInput(formData));
  done();
}

export async function toggleQueryAction(formData: FormData) {
  await setQueryStatus(id(formData), formData.get("status") === "active" ? "active" : "paused");
  done();
}

export async function deleteQueryAction(formData: FormData) {
  await deleteQuery(id(formData));
  done();
}

export async function refineAction(): Promise<ActionState> {
  try {
    const r = await refineQueries();
    done();
    return { message: `Refined by ${r.Model}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}
