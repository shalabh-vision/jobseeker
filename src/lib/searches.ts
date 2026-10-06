import { z } from "zod";
import { execute, fixUntypedNumbers, getPool, query, sql } from "./db";
import { generateJson } from "./gemini";
import { getProfile } from "./profile";
import { getNumberSetting } from "./settings";
import { pickVacancyQueries } from "./vacancies";

/** Region labels that JSearch resolves well, in addition to the individual target cities. */
const REGIONS = ["Delhi NCR"];
/** Query location for work-from-home searches; sent to JSearch with work_from_home=true. */
export const REMOTE = "Remote";

export type WorkMode = "onsite" | "remote";

export type TargetLocation = { City: string; Region: string; Aliases: string };

export type SavedSearch = {
  Id: number;
  RoleTitle: string;
  Keywords: string;
  Cities: string[];
  WorkMode: WorkMode;
  Industries: string;
  Origin: "ai" | "user";
  Rationale: string | null;
  IsActive: boolean;
  UpdatedAt: Date;
};

export type SearchQuery = {
  Id: number;
  QueryText: string;
  Location: string;
  Priority: number;
  Rationale: string | null;
  Origin: "ai" | "user";
  Status: "active" | "paused" | "retired";
  LastRunAt: Date | null;
  SavedSearchIds: number[];
  JobsFound: number;
  JobsApproved: number;
  JobsRejected: number;
  JobsFiltered: number;
};

export type QueryRefinement = { Id: number; Model: string; Budget: number; Summary: string; CreatedAt: Date };

export async function getTargetLocations(): Promise<TargetLocation[]> {
  return query<TargetLocation>("SELECT City, Region, Aliases FROM dbo.TargetLocations WHERE IsActive = 1 ORDER BY Region, City");
}

export async function getAllowedQueryLocations(): Promise<string[]> {
  return [...REGIONS, ...(await getTargetLocations()).map((l) => l.City), REMOTE];
}

// ---------- Saved searches ----------

type SavedSearchRow = Omit<SavedSearch, "Cities"> & { Cities: string };

export async function listSavedSearches(): Promise<SavedSearch[]> {
  const rows = await query<SavedSearchRow>(
    `SELECT Id, RoleTitle, Keywords, Cities, WorkMode, Industries, Origin, Rationale, IsActive, UpdatedAt
       FROM dbo.SavedSearches ORDER BY IsActive DESC, WorkMode, RoleTitle`,
  );
  return rows.map((r) => ({ ...r, Cities: r.Cities ? r.Cities.split("|") : [] }));
}

export type SavedSearchInput = {
  roleTitle: string;
  keywords: string;
  cities: string[];
  workMode: WorkMode;
  industries: string;
};

function checkSavedSearchInput(input: SavedSearchInput) {
  if (!input.roleTitle.trim()) throw new Error("Role title is required");
  if (input.workMode !== "onsite" && input.workMode !== "remote") throw new Error("Unknown work mode");
}

async function validCities(cities: string[]): Promise<string> {
  const known = new Set((await getTargetLocations()).map((l) => l.City));
  const picked = cities.filter((c) => known.has(c));
  // Every city selected is the same as "all cities", and stays correct if cities are added later.
  return picked.length === known.size ? "" : picked.join("|");
}

async function savedSearchParams(input: SavedSearchInput) {
  checkSavedSearchInput(input);
  return {
    roleTitle: input.roleTitle.trim(),
    keywords: input.keywords.trim(),
    // Remote searches are not tied to a city.
    cities: input.workMode === "remote" ? "" : await validCities(input.cities),
    workMode: input.workMode,
    industries: input.industries.trim(),
  };
}

export async function createSavedSearch(input: SavedSearchInput, origin: "ai" | "user" = "user", rationale?: string) {
  await execute(
    `INSERT dbo.SavedSearches (RoleTitle, Keywords, Cities, WorkMode, Industries, Origin, Rationale)
     VALUES (@roleTitle, @keywords, @cities, @workMode, @industries, @origin, @rationale)`,
    { ...(await savedSearchParams(input)), origin, rationale: rationale ?? null },
  );
}

export async function updateSavedSearch(id: number, input: SavedSearchInput) {
  await execute(
    `UPDATE dbo.SavedSearches SET RoleTitle = @roleTitle, Keywords = @keywords, Cities = @cities, WorkMode = @workMode,
            Industries = @industries, UpdatedAt = SYSUTCDATETIME()
     WHERE Id = @id`,
    { id, ...(await savedSearchParams(input)) },
  );
}

export async function setSavedSearchActive(id: number, active: boolean) {
  await execute("UPDATE dbo.SavedSearches SET IsActive = @active, UpdatedAt = SYSUTCDATETIME() WHERE Id = @id", { id, active });
}

export async function deleteSavedSearch(id: number) {
  await execute("DELETE dbo.SavedSearches WHERE Id = @id", { id });
}

/** Adds the profile's suggested roles that are not saved yet. Returns how many were added. */
export async function importSuggestedRoles(): Promise<number> {
  const analysis = (await getProfile())?.analysis;
  if (!analysis) throw new Error("Analyse your resume on the Profile page first");
  const existing = new Set((await listSavedSearches()).map((s) => s.RoleTitle.toLowerCase()));
  let added = 0;
  for (const role of analysis.suitableRoles) {
    if (existing.has(role.title.toLowerCase())) continue;
    await createSavedSearch(
      { roleTitle: role.title, keywords: role.searchKeywords.join(", "), cities: [], workMode: "onsite", industries: "" },
      "ai",
      `${role.fit} fit: ${role.rationale}`,
    );
    added++;
  }
  return added;
}

// ---------- Refined queries ----------

type SearchQueryRow = Omit<SearchQuery, "SavedSearchIds"> & { SavedSearchIds: string | null };

export async function listSearchQueries(includeRetired = false): Promise<SearchQuery[]> {
  const rows = await query<SearchQueryRow>(
    `SELECT q.Id, q.QueryText, q.Location, q.Priority, q.Rationale, q.Origin, q.Status, q.LastRunAt,
            (SELECT STRING_AGG(CAST(s.SavedSearchId AS NVARCHAR(10)), ',') FROM dbo.SearchQuerySources s
              WHERE s.SearchQueryId = q.Id) AS SavedSearchIds,
            COUNT(j.Id) AS JobsFound,
            SUM(CASE WHEN j.Status = N'approved' THEN 1 ELSE 0 END) AS JobsApproved,
            SUM(CASE WHEN j.Status = N'rejected' THEN 1 ELSE 0 END) AS JobsRejected,
            SUM(CASE WHEN j.Status = N'filtered' THEN 1 ELSE 0 END) AS JobsFiltered
       FROM dbo.SearchQueries q
       LEFT JOIN dbo.JobPostings j ON j.SearchQueryId = q.Id
      WHERE @includeRetired = 1 OR q.Status <> N'retired'
      GROUP BY q.Id, q.QueryText, q.Location, q.Priority, q.Rationale, q.Origin, q.Status, q.LastRunAt
      ORDER BY CASE q.Status WHEN N'active' THEN 0 WHEN N'paused' THEN 1 ELSE 2 END, q.Priority, q.Location, q.QueryText`,
    { includeRetired },
  );
  return rows.map((r) => ({ ...r, SavedSearchIds: r.SavedSearchIds ? r.SavedSearchIds.split(",").map(Number) : [] }));
}

export async function getLatestRefinement(): Promise<QueryRefinement | null> {
  const [row] = await query<QueryRefinement>(
    "SELECT TOP 1 Id, Model, Budget, Summary, CreatedAt FROM dbo.QueryRefinements ORDER BY Id DESC",
  );
  return row ?? null;
}

/** True when saved searches changed after the last refinement (or there has never been one). */
export async function isRefinementStale(): Promise<boolean> {
  const [row] = await query<{ Stale: boolean }>(
    `SELECT CAST(CASE WHEN r.CreatedAt IS NULL OR s.LastChange > r.CreatedAt THEN 1 ELSE 0 END AS BIT) AS Stale
       FROM (SELECT MAX(UpdatedAt) AS LastChange FROM dbo.SavedSearches) s
       OUTER APPLY (SELECT TOP 1 CreatedAt FROM dbo.QueryRefinements ORDER BY Id DESC) r`,
  );
  return row?.Stale ?? true;
}

export type QueryInput = { queryText: string; location: string; priority: number };

async function checkQueryInput(input: QueryInput) {
  if (!input.queryText.trim()) throw new Error("Query text is required");
  if (!(await getAllowedQueryLocations()).includes(input.location)) throw new Error(`Unknown location ${input.location}`);
  if (![1, 2, 3].includes(input.priority)) throw new Error("Priority must be 1, 2 or 3");
}

export async function addManualQuery(input: QueryInput) {
  await checkQueryInput(input);
  await execute(
    `INSERT dbo.SearchQueries (QueryText, Location, Priority, Origin, Status, Rationale)
     VALUES (@text, @location, @priority, N'user', N'active', N'Added by you')`,
    { text: input.queryText.trim(), location: input.location, priority: input.priority },
  );
}

/** Editing a query makes it yours: refinements will no longer replace it. */
export async function updateQuery(id: number, input: QueryInput) {
  await checkQueryInput(input);
  await execute(
    `UPDATE dbo.SearchQueries SET QueryText = @text, Location = @location, Priority = @priority, Origin = N'user'
     WHERE Id = @id AND Status <> N'retired'`,
    { id, text: input.queryText.trim(), location: input.location, priority: input.priority },
  );
}

export async function setQueryStatus(id: number, status: "active" | "paused") {
  await execute("UPDATE dbo.SearchQueries SET Status = @status WHERE Id = @id AND Status <> N'retired'", { id, status });
}

export async function deleteQuery(id: number) {
  await execute("DELETE dbo.SearchQueries WHERE Id = @id", { id });
}

// ---------- Gemini refinement ----------

function refinementSchema(locations: string[]) {
  return z.object({
    summary: z.string().describe("2-4 sentences for the user: what changed and why"),
    queries: z.array(
      z.object({
        queryText: z.string().describe("Job-title search text WITHOUT the location, 2-8 words, may use OR"),
        location: z.enum(locations as [string, ...string[]]),
        savedSearchIds: z
          .array(z.number().int())
          .min(1)
          .describe("Ids (the numbers before the colon) of every saved search this query serves"),
        priority: z.number().int().min(1).max(3).describe("1 = most likely to find strong matches"),
        rationale: z.string().describe("One sentence on why this query and location"),
      }),
    ),
  });
}

const REFINE_SYSTEM = `You design job-search queries for a senior software professional in India.
Queries are sent to JSearch, a Google for Jobs API. Rules learned from testing it:
- "A OR B OR C" works: merge titles recruiters treat as interchangeable into one query (max 4 alternatives).
- The location is appended as " in <location>". Tested: "Delhi NCR" returns mostly New Delhi postings (25 of 27),
  so it does NOT cover Noida and Gurugram, which are the largest IT hubs. Query Noida and Gurugram by name.
- The word "Architect" alone returns building, civil and interior architects. Always qualify it with a software
  term such as Software, Solution, Technical, Cloud, Enterprise or .NET.
- Each query returns only about 10 postings, so specific titles beat broad ones in large markets.
- Keep queries short. No minus signs, quotes or site: operators.
- There is no Tricity region: "Chandigarh" returns Chandigarh postings only. Mohali (an IT hub, listed as
  "Sahibzada Ajit Singh Nagar") and Panchkula need their own queries.
- Coverage order: every onsite saved search in Gurugram and Noida (the largest markets), then Delhi, Chandigarh,
  Mohali. Merge related titles with OR so this fits the budget. Avoid "Delhi NCR"; use "Delhi" for New Delhi.
  Panchkula has few tech jobs: give it at most one combined query.
- Each query costs one API request from a fixed budget per run; never exceed it.
- REMOTE saved searches use location "Remote" (sent with a work-from-home filter). Search them by skills and
  seniority, e.g. "senior React developer" - industry words in the query return almost nothing, because postings
  rarely name the employer's industry. Industries are applied later when scoring results.
- ONSITE saved searches must never use location "Remote".
Base the queries on the user's saved searches. Do not invent roles the user did not ask for.`;

export async function refineQueries(): Promise<QueryRefinement> {
  const [saved, profile, cities, previous, maxRequests] = await Promise.all([
    listSavedSearches(),
    getProfile(),
    getTargetLocations(),
    listSearchQueries(true),
    getNumberSetting("fetch.maxRequestsPerRun", 18),
  ]);
  const active = saved.filter((s) => s.IsActive);
  if (active.length === 0) throw new Error("Add or activate at least one saved search first");

  const manual = previous.filter((q) => q.Origin === "user" && q.Status === "active");
  // The Tricity vacancy queries run first in every fetch and use part of the same budget.
  const vacancyQueries = (await pickVacancyQueries()).length;
  const budget = maxRequests - vacancyQueries - manual.length;
  if (budget < 1) throw new Error("Your own active queries already use the whole request budget");

  const locations = [...REGIONS, ...cities.map((c) => c.City), REMOTE];
  const describe = (s: SavedSearch) =>
    s.WorkMode === "remote"
      ? `${s.Id}: [REMOTE] ${s.RoleTitle} | ${s.Keywords || "-"} | work from home anywhere in India`
      : `${s.Id}: [ONSITE] ${s.RoleTitle} | ${s.Keywords || "-"} | ${s.Cities.length ? s.Cities.join(", ") : "all target cities"}`;
  const a = profile?.analysis;
  const prompt = [
    a
      ? `CANDIDATE: ${a.headline}. ${a.totalYearsExperience} years in software. Core skills: ${a.coreSkills.join(", ")}.`
      : "CANDIDATE: (no resume analysis available)",
    `\nTARGET CITIES: ${cities.map((c) => `${c.City} (${c.Region})`).join(", ")}. Allowed query locations: ${locations.join(", ")}.`,
    `\nSAVED SEARCHES (id: [mode] role | keywords | where):`,
    ...active.map(describe),
    manual.length
      ? `\nQUERIES THE USER WROTE (already running; do not duplicate):\n${manual.map((q) => `- ${q.QueryText} in ${q.Location}`).join("\n")}`
      : "",
    previous.some((q) => q.JobsFound > 0)
      ? `\nRESULTS OF EARLIER QUERIES (found / approved by user / rejected by user / filtered as unsuitable):\n` +
        previous
          .filter((q) => q.JobsFound > 0)
          .map((q) => `- "${q.QueryText} in ${q.Location}": ${q.JobsFound} / ${q.JobsApproved} / ${q.JobsRejected} / ${q.JobsFiltered}`)
          .join("\n") +
        "\nKeep or vary queries that led to approvals; rewrite or drop ones that mostly produce rejected or filtered jobs."
      : "\nNo earlier results yet.",
    `\nBUDGET: at most ${budget} queries. Use most of it: cover every saved search in each of its cities, merging where sensible.`,
  ].join("\n");

  const { data, model } = await generateJson(refinementSchema(locations), prompt, REFINE_SYSTEM);

  // A query may only serve saved searches of its own work mode (remote queries <-> remote searches).
  const modeById = new Map(active.map((s) => [s.Id, s.WorkMode]));
  const seen = new Set(manual.map((q) => `${q.QueryText.toLowerCase()}|${q.Location}`));
  const queries = data.queries
    .map((q) => {
      const mode: WorkMode = q.location === REMOTE ? "remote" : "onsite";
      return { ...q, queryText: q.queryText.trim(), savedSearchIds: q.savedSearchIds.filter((id) => modeById.get(id) === mode) };
    })
    .filter((q) => {
      const key = `${q.queryText.toLowerCase()}|${q.location}`;
      if (!q.queryText || q.savedSearchIds.length === 0 || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => x.priority - y.priority)
    .slice(0, budget);
  if (queries.length === 0) {
    const got = data.queries.map((q) => `${q.queryText} in ${q.location} [${q.savedSearchIds.join(",")}]`).join("; ");
    throw new Error(`${model} returned no usable queries (none matched an active saved search): ${got}`);
  }

  const tx = new sql.Transaction(await getPool());
  await tx.begin();
  try {
    const refinement = await new sql.Request(tx)
      .input("model", model)
      .input("budget", budget)
      .input("summary", data.summary)
      .query<QueryRefinement>(
        `INSERT dbo.QueryRefinements (Model, Budget, Summary) OUTPUT inserted.Id, inserted.Model, inserted.Budget,
         inserted.Summary, inserted.CreatedAt VALUES (@model, @budget, @summary)`,
      );
    const refinementId = refinement.recordset[0].Id;

    await new sql.Request(tx).query(
      "UPDATE dbo.SearchQueries SET Status = N'retired' WHERE Origin = N'ai' AND Status <> N'retired'",
    );
    for (const q of queries) {
      const inserted = await new sql.Request(tx)
        .input("text", q.queryText)
        .input("location", q.location)
        .input("priority", q.priority)
        .input("rationale", q.rationale)
        .input("refinementId", refinementId)
        .query<{ Id: number }>(
          `INSERT dbo.SearchQueries (QueryText, Location, Priority, Rationale, Origin, Status, RefinementId)
           OUTPUT inserted.Id VALUES (@text, @location, @priority, @rationale, N'ai', N'active', @refinementId)`,
        );
      for (const savedId of q.savedSearchIds) {
        await new sql.Request(tx)
          .input("queryId", inserted.recordset[0].Id)
          .input("savedId", savedId)
          .query("INSERT dbo.SearchQuerySources (SearchQueryId, SavedSearchId) VALUES (@queryId, @savedId)");
      }
    }
    await tx.commit();
    return fixUntypedNumbers(refinement.recordset)[0];
  } catch (err) {
    await tx.rollback();
    throw err;
  }
}
