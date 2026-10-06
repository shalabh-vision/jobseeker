import { execute, query } from "./db";
import { normaliseEmployer } from "./job-rules";
import { LIST_COLUMNS, LIST_FROM, type JobListItem } from "./jobs";
import type { TargetLocation } from "./searches";
import { getNumberSetting } from "./settings";
import { detectStacks } from "./stacks";

export type VacancyCity = {
  City: string;
  Section: string;
  Country: string;
  Aliases: string;
  TopCompanies: number;
  AutoFetch: boolean;
  SortOrder: number;
  LastRunAt: Date | null;
};
export type VacancyQuery = { Id: number; Stack: string; QueryText: string; City: string; Country: string };

export async function listVacancyCities(): Promise<VacancyCity[]> {
  return query<VacancyCity>(
    `SELECT c.City, c.Section, c.Country, c.Aliases, c.TopCompanies, c.AutoFetch, c.SortOrder,
            (SELECT MAX(q.LastRunAt) FROM dbo.VacancyQueries q WHERE q.City = c.City) AS LastRunAt
       FROM dbo.VacancyCities c WHERE c.IsActive = 1 ORDER BY c.SortOrder`,
  );
}

/** Vacancy cities in the shape the posting rules use to recognise a posting's city. */
export const asRuleLocations = (cities: VacancyCity[]): TargetLocation[] =>
  cities.map((c) => ({ City: c.City, Region: c.Section, Aliases: c.Aliases }));

/**
 * Queries for a fetch run: the AutoFetch cities (the Tricity) on a normal run, or only the cities you picked on the
 * Vacancies page. The JSearch budget is why the other cities never run automatically.
 */
export async function pickVacancyQueries(cities?: string[]): Promise<VacancyQuery[]> {
  const all = await query<VacancyQuery & { AutoFetch: boolean }>(
    `SELECT q.Id, q.Stack, q.QueryText, q.City, c.Country, c.AutoFetch
       FROM dbo.VacancyQueries q JOIN dbo.VacancyCities c ON c.City = q.City
      WHERE q.IsActive = 1 AND c.IsActive = 1
      ORDER BY c.SortOrder, q.Id`,
  );
  return all.filter((q) => (cities ? cities.includes(q.City) : q.AutoFetch));
}

/** Tags postings stored before stack detection existed. Returns how many. */
export async function tagUntaggedStacks(): Promise<number> {
  const rows = await query<{ Id: number; Title: string; Description: string }>(
    "SELECT Id, Title, Description FROM dbo.JobPostings WHERE Stacks IS NULL",
  );
  for (const r of rows) {
    await execute("UPDATE dbo.JobPostings SET Stacks = @stacks WHERE Id = @id", { id: r.Id, stacks: detectStacks(r.Title, r.Description) });
  }
  return rows.length;
}

// A vacancy is a stack posting in a vacancy city, posted within the age limit, that is a real full-time job.
// Postings filtered for fit, seniority or title words still count: the company is hiring for the stack.
const EXCLUDED_STAGES = "N'scam', N'blocked', N'location', N'age', N'type', N'duplicate'";

/** Matches your profile: passed the rules and the Gemini fit score (same rules as Discover). */
export const isMatch = (j: Pick<JobListItem, "Status" | "FitScore">) =>
  (j.Status === "new" || j.Status === "approved") && j.FitScore !== null;
export const isAwaitingScore = (j: Pick<JobListItem, "Status" | "FitScore">) => j.Status === "new" && j.FitScore === null;

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const companySlug = (employerName: string) => slugify(normaliseEmployer(employerName)) || slugify(employerName);

export type VacancyRow = JobListItem & { EmployerLogo: string | null; Section: string };

async function listVacancyRows(stack: string): Promise<VacancyRow[]> {
  return query<VacancyRow>(
    `SELECT ${LIST_COLUMNS}, j.EmployerLogo, c.Section
       FROM ${LIST_FROM}
       JOIN dbo.VacancyCities c ON c.City = j.City AND c.IsActive = 1
      WHERE j.Stacks LIKE @stackLike AND j.DuplicateOfId IS NULL
        AND COALESCE(j.PostedAt, j.FirstSeenAt) >= DATEADD(DAY, -@maxAgeDays, SYSUTCDATETIME())
        AND (j.FilterStage IS NULL OR j.FilterStage NOT IN (${EXCLUDED_STAGES}))
      ORDER BY COALESCE(j.PostedAt, j.FirstSeenAt) DESC`,
    { stackLike: `%,${stack},%`, maxAgeDays: await getNumberSetting("filter.maxAgeDays", 30) },
  );
}

export type VacancyCompany = {
  slug: string;
  name: string;
  logo: string | null;
  cities: string[];
  openings: number;
  matching: number;
  awaiting: number;
  bestScore: number | null;
  latestPostedAt: Date | null;
  titles: string[];
};

export type VacancySection = {
  section: string;
  cities: VacancyCity[];
  /** How many companies the page lists before you search. */
  topCompanies: number;
  companies: VacancyCompany[];
  openings: number;
  lastRunAt: Date | null;
};

function summarise(slug: string, rows: VacancyRow[]): VacancyCompany {
  const scores = rows.filter(isMatch).map((r) => r.FitScore as number);
  return {
    slug,
    // Rows are newest first: show the company as its latest posting names it.
    name: rows[0].EmployerName,
    logo: rows.find((r) => r.EmployerLogo)?.EmployerLogo ?? null,
    cities: [...new Set(rows.map((r) => r.City as string))].sort(),
    openings: rows.length,
    matching: scores.length,
    awaiting: rows.filter(isAwaitingScore).length,
    bestScore: scores.length ? Math.max(...scores) : null,
    latestPostedAt: rows[0].PostedAt ?? rows[0].FirstSeenAt,
    titles: rows.map((r) => r.Title),
  };
}

const byOpenings = (a: VacancyCompany, b: VacancyCompany) =>
  b.openings - a.openings || b.matching - a.matching || (b.latestPostedAt?.getTime() ?? 0) - (a.latestPostedAt?.getTime() ?? 0);

/**
 * Companies with open vacancies for the stack, per section in city order, most openings first. Every company is
 * returned so search covers them all; the page lists only the section's top recruiters until you search.
 */
export async function listVacancySections(stack: string): Promise<VacancySection[]> {
  const [rows, cities] = await Promise.all([listVacancyRows(stack), listVacancyCities()]);
  const sections = [...new Set(cities.map((c) => c.Section))];
  return sections.map((section) => {
    const sectionCities = cities.filter((c) => c.Section === section);
    const runs = sectionCities.map((c) => c.LastRunAt?.getTime() ?? 0).filter(Boolean);
    const byCompany = new Map<string, VacancyRow[]>();
    for (const row of rows.filter((r) => r.Section === section)) {
      const slug = companySlug(row.EmployerName);
      byCompany.set(slug, [...(byCompany.get(slug) ?? []), row]);
    }
    const companies = [...byCompany].map(([slug, list]) => summarise(slug, list)).sort(byOpenings);
    return {
      section,
      cities: sectionCities,
      topCompanies: Math.max(...sectionCities.map((c) => c.TopCompanies)),
      companies,
      openings: companies.reduce((n, c) => n + c.openings, 0),
      lastRunAt: runs.length ? new Date(Math.max(...runs)) : null,
    };
  });
}

/** One company's open vacancies for the stack in every vacancy city, best fit first. */
export async function getCompanyVacancies(stack: string, slug: string) {
  const rows = (await listVacancyRows(stack)).filter((r) => companySlug(r.EmployerName) === slug);
  if (rows.length === 0) return null;
  const byScore = (a: JobListItem, b: JobListItem) => (b.FitScore ?? -1) - (a.FitScore ?? -1);
  return {
    name: rows[0].EmployerName,
    logo: rows.find((r) => r.EmployerLogo)?.EmployerLogo ?? null,
    cities: [...new Set(rows.map((r) => r.City as string))].sort(),
    matching: rows.filter(isMatch).sort(byScore),
    awaiting: rows.filter(isAwaitingScore),
    others: rows.filter((r) => !isMatch(r) && !isAwaitingScore(r)).sort(byScore),
  };
}

/** Active query count per city for the stack (each costs one JSearch request per fetch). */
export async function countQueriesByCity(stack: string): Promise<Map<string, number>> {
  const rows = await query<{ City: string; N: number }>(
    "SELECT City, COUNT(*) AS N FROM dbo.VacancyQueries WHERE Stack = @stack AND IsActive = 1 GROUP BY City",
    { stack },
  );
  return new Map(rows.map((r) => [r.City, r.N]));
}

