import type { Metadata } from "next";
import { connection } from "next/server";
import { formatDateTime } from "@/lib/format";
import {
  getAllowedQueryLocations,
  getLatestRefinement,
  getTargetLocations,
  isRefinementStale,
  listSavedSearches,
  listSearchQueries,
  type SavedSearch,
  type SearchQuery,
  type TargetLocation,
} from "@/lib/searches";
import { getNumberSetting } from "@/lib/settings";
import {
  addQueryAction,
  addSavedSearchAction,
  deleteQueryAction,
  deleteSavedSearchAction,
  importRolesAction,
  toggleQueryAction,
  toggleSavedSearchAction,
  updateQueryAction,
  updateSavedSearchAction,
} from "./actions";
import { RefineButton } from "./refine-button";

export const metadata: Metadata = { title: "Searches" };

const input = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
const smallButton = "rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium hover:bg-gray-50";
const primaryButton = "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700";

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{children}</span>;
}

function SavedSearchForm({
  action,
  locations,
  search,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  locations: TargetLocation[];
  search?: SavedSearch;
  submitLabel: string;
}) {
  const mode = search?.WorkMode ?? "onsite";
  // An empty city list means "all cities".
  const checked = (city: string) => !search || search.Cities.length === 0 || search.Cities.includes(city);
  return (
    <form action={action} className="grid gap-3 md:grid-cols-2">
      {search && <input type="hidden" name="id" value={search.Id} />}
      <label className="text-sm">
        Role title
        <input name="roleTitle" required defaultValue={search?.RoleTitle} className={input} placeholder="e.g. Solutions Architect" />
      </label>
      <label className="text-sm">
        Keywords
        <input name="keywords" defaultValue={search?.Keywords} className={input} placeholder="e.g. .NET, Azure, microservices" />
      </label>
      <fieldset className="text-sm">
        <legend>Work mode</legend>
        <label className="mr-4">
          <input type="radio" name="workMode" value="onsite" defaultChecked={mode === "onsite"} /> Office / hybrid in my cities
        </label>
        <label>
          <input type="radio" name="workMode" value="remote" defaultChecked={mode === "remote"} /> Remote (work from home)
        </label>
      </fieldset>
      <fieldset className="text-sm">
        <legend>Cities (office / hybrid only)</legend>
        <div className="flex flex-wrap gap-x-3">
          {locations.map((l) => (
            <label key={l.City}>
              <input type="checkbox" name="cities" value={l.City} defaultChecked={checked(l.City)} /> {l.City}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="text-sm md:col-span-2">
        Preferred industries (optional, used to rank results)
        <input
          name="industries"
          defaultValue={search?.Industries}
          className={input}
          placeholder="e.g. online dating, video streaming / OTT, adult entertainment"
        />
      </label>
      <div>
        <button type="submit" className={primaryButton}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function SavedSearchRow({ search, locations }: { search: SavedSearch; locations: TargetLocation[] }) {
  const where =
    search.WorkMode === "remote"
      ? "Work from home, anywhere in India"
      : search.Cities.length === 0
        ? `All ${locations.length} cities`
        : search.Cities.join(", ");
  return (
    <li className={`rounded-md border border-gray-200 p-3 ${search.IsActive ? "" : "bg-gray-50 opacity-70"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{search.RoleTitle}</span>
            {search.WorkMode === "remote" && <Badge tone="bg-purple-100 text-purple-800">remote</Badge>}
            <Badge tone={search.Origin === "ai" ? "bg-sky-100 text-sky-800" : "bg-gray-200 text-gray-700"}>
              {search.Origin === "ai" ? "from resume" : "added by you"}
            </Badge>
            {!search.IsActive && <Badge tone="bg-gray-200 text-gray-700">off</Badge>}
          </div>
          <p className="text-sm text-gray-600">
            {where}
            {search.Keywords && <> · {search.Keywords}</>}
          </p>
          {search.Industries && <p className="text-sm text-gray-600">Preferred industries: {search.Industries}</p>}
        </div>
        <div className="flex gap-1.5">
          <form action={toggleSavedSearchAction}>
            <input type="hidden" name="id" value={search.Id} />
            <input type="hidden" name="active" value={search.IsActive ? "0" : "1"} />
            <button className={smallButton}>{search.IsActive ? "Turn off" : "Turn on"}</button>
          </form>
          <form action={deleteSavedSearchAction}>
            <input type="hidden" name="id" value={search.Id} />
            <button className={`${smallButton} text-red-700`}>Delete</button>
          </form>
        </div>
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-xs text-indigo-700">Edit</summary>
        <div className="mt-2">
          <SavedSearchForm action={updateSavedSearchAction} locations={locations} search={search} submitLabel="Save changes" />
        </div>
      </details>
    </li>
  );
}

function QueryForm({
  action,
  locations,
  query,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  locations: string[];
  query?: SearchQuery;
  submitLabel: string;
}) {
  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      {query && <input type="hidden" name="id" value={query.Id} />}
      <label className="min-w-64 flex-1 text-sm">
        Search text
        <input name="queryText" required defaultValue={query?.QueryText} className={input} placeholder="e.g. .NET Architect OR Technical Architect" />
      </label>
      <label className="text-sm">
        Location
        <select name="location" defaultValue={query?.Location ?? locations[0]} className={input}>
          {locations.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Priority
        <select name="priority" defaultValue={query?.Priority ?? 2} className={input}>
          <option value={1}>1 (high)</option>
          <option value={2}>2</option>
          <option value={3}>3 (low)</option>
        </select>
      </label>
      <button type="submit" className={primaryButton}>
        {submitLabel}
      </button>
    </form>
  );
}

function QueryRow({ query, roleById, locations }: { query: SearchQuery; roleById: Map<number, string>; locations: string[] }) {
  const paused = query.Status === "paused";
  return (
    <tr className={`border-t border-gray-100 align-top ${paused ? "opacity-60" : ""}`}>
      <td className="py-2 pr-3 text-sm">P{query.Priority}</td>
      <td className="py-2 pr-3">
        <div className="text-sm font-medium">
          {query.QueryText} <span className="font-normal text-gray-500">in {query.Location}</span>
        </div>
        <div className="text-xs text-gray-500">
          {query.Origin === "user" ? "Yours (kept when refining)" : query.Rationale}
          {query.SavedSearchIds.length > 0 && <> · for: {query.SavedSearchIds.map((id) => roleById.get(id) ?? `#${id}`).join(", ")}</>}
        </div>
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-indigo-700">Edit</summary>
          <div className="mt-2">
            <QueryForm action={updateQueryAction} locations={locations} query={query} submitLabel="Save" />
          </div>
        </details>
      </td>
      <td className="py-2 pr-3 text-xs text-gray-600">{query.LastRunAt ? formatDateTime(query.LastRunAt) : "never"}</td>
      <td className="py-2 pr-3 text-xs text-gray-600">
        {query.JobsFound} found · {query.JobsApproved} approved · {query.JobsRejected} rejected · {query.JobsFiltered} filtered
      </td>
      <td className="py-2">
        <div className="flex gap-1.5">
          <form action={toggleQueryAction}>
            <input type="hidden" name="id" value={query.Id} />
            <input type="hidden" name="status" value={paused ? "active" : "paused"} />
            <button className={smallButton}>{paused ? "Resume" : "Pause"}</button>
          </form>
          <form action={deleteQueryAction}>
            <input type="hidden" name="id" value={query.Id} />
            <button className={`${smallButton} text-red-700`}>Delete</button>
          </form>
        </div>
      </td>
    </tr>
  );
}

export default async function SearchesPage() {
  await connection();
  const [saved, locations, queryLocations, queries, refinement, stale, budget] = await Promise.all([
    listSavedSearches(),
    getTargetLocations(),
    getAllowedQueryLocations(),
    listSearchQueries(),
    getLatestRefinement(),
    isRefinementStale(),
    getNumberSetting("fetch.maxRequestsPerRun", 18),
  ]);
  const roleById = new Map(saved.map((s) => [s.Id, s.RoleTitle]));
  const activeQueries = queries.filter((q) => q.Status === "active").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Searches</h1>
        <p className="text-gray-600">
          Saved searches say what you are looking for. Before searching online, Gemini refines them into the exact
          queries sent to the job feed, within a budget of {budget} requests per run.
        </p>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Saved searches</h2>
          <form action={importRolesAction}>
            <button className={smallButton}>Add roles suggested from my resume</button>
          </form>
        </div>
        {saved.length === 0 ? (
          <p className="text-sm text-gray-600">No saved searches yet.</p>
        ) : (
          <ul className="space-y-2">
            {saved.map((s) => (
              <SavedSearchRow key={s.Id} search={s} locations={locations} />
            ))}
          </ul>
        )}
        <details className="mt-4 rounded-md border border-dashed border-gray-300 p-3">
          <summary className="cursor-pointer text-sm font-medium text-indigo-700">Add a saved search</summary>
          <div className="mt-3">
            <SavedSearchForm action={addSavedSearchAction} locations={locations} submitLabel="Add saved search" />
          </div>
        </details>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Refined queries</h2>
        <div className="mb-4 space-y-2">
          <p className="text-sm text-gray-700">
            {refinement ? (
              <>
                Last refined {formatDateTime(refinement.CreatedAt)} by {refinement.Model}. {activeQueries} of {budget} requests
                per run in use.
              </>
            ) : (
              "Not refined yet."
            )}
          </p>
          {stale && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Your saved searches changed since the last refinement. The next job fetch refines them automatically, or
              refine now to review the queries first.
            </p>
          )}
          {refinement && <p className="text-sm italic text-gray-600">“{refinement.Summary}”</p>}
          <RefineButton stale={stale} />
        </div>

        {queries.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-xs uppercase text-gray-500">
                <tr>
                  <th className="pb-2 pr-3 font-medium">Pri.</th>
                  <th className="pb-2 pr-3 font-medium">Query</th>
                  <th className="pb-2 pr-3 font-medium">Last run</th>
                  <th className="pb-2 pr-3 font-medium">Results</th>
                  <th className="pb-2 font-medium" />
                </tr>
              </thead>
              <tbody>
                {queries.map((q) => (
                  <QueryRow key={q.Id} query={q} roleById={roleById} locations={queryLocations} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        <details className="mt-4 rounded-md border border-dashed border-gray-300 p-3">
          <summary className="cursor-pointer text-sm font-medium text-indigo-700">Add your own query</summary>
          <div className="mt-3">
            <QueryForm action={addQueryAction} locations={queryLocations} submitLabel="Add query" />
          </div>
        </details>
      </section>
    </div>
  );
}
