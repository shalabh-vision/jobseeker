import { z } from "zod";
import { execute, query } from "./db";
import { generateJson } from "./gemini";
import { normaliseEmployer } from "./job-rules";
import { LIST_COLUMNS, LIST_FROM, type JobListItem } from "./jobs";
import { getProfile } from "./profile";
import { getNumberSetting, getStringSetting } from "./settings";

export type TopPickQuery = {
  Id: number;
  QueryText: string;
  WorkMode: "india" | "remote";
  LastRunAt: Date | null;
};

export async function listTopPickQueries(): Promise<TopPickQuery[]> {
  return query<TopPickQuery>(
    "SELECT Id, QueryText, WorkMode, LastRunAt FROM dbo.TopPickQueries WHERE IsActive = 1 ORDER BY WorkMode, Id",
  );
}

// ---------- Company facts (Wikidata) ----------

export type CompanyFacts = {
  WikidataId: string | null;
  Label: string | null;
  Description: string | null;
  Employees: number | null;
  Founded: number | null;
  Industries: string | null;
  Country: string | null;
};

const WIKIDATA = "https://www.wikidata.org/w/api.php";
const USER_AGENT = "SahiNaukri/0.1 (personal job-search tool; non-commercial)";

type Claim = { mainsnak?: { datavalue?: { value?: unknown } } };
type Entity = {
  id: string;
  labels?: { en?: { value: string } };
  descriptions?: { en?: { value: string } };
  claims?: Record<string, Claim[]>;
};

// Wikidata answered 429 to bursts of 4 lookups a second (2026-10-06): one request every 1.5 s, and wait on 429.
let nextWikidataAt = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function wikidata(params: Record<string, string>) {
  const url = `${WIKIDATA}?${new URLSearchParams({ ...params, format: "json" })}`;
  for (let attempt = 0; ; attempt++) {
    const wait = nextWikidataAt - Date.now();
    nextWikidataAt = Math.max(Date.now(), nextWikidataAt) + 1500;
    if (wait > 0) await sleep(wait);
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 429 && attempt < 2) {
      await sleep(Number(response.headers.get("retry-after") ?? 0) * 1000 || 15_000);
      continue;
    }
    if (!response.ok) throw new Error(`Wikidata ${response.status}`);
    return response.json();
  }
}

const values = (e: Entity, prop: string) => (e.claims?.[prop] ?? []).map((c) => c.mainsnak?.datavalue?.value).filter(Boolean);
const itemIds = (e: Entity, prop: string) => values(e, prop).map((v) => (v as { id: string }).id);

/** Looks the employer up on Wikidata once (cached in dbo.CompanyFacts). Only entries that describe a business count. */
const employerKey = (name: string) => normaliseEmployer(name) || name.toLowerCase();

/** Looks up Wikidata facts for pool employers that have never been looked up (or failed earlier). */
export async function fillMissingCompanyFacts(log: (line: string) => void): Promise<number> {
  const names = await query<{ EmployerName: string }>(
    `SELECT DISTINCT j.EmployerName FROM dbo.JobPostings j WHERE ${POOL_WHERE} AND j.QualityAt IS NOT NULL`,
    await poolParams(),
  );
  const known = new Set(
    (await query<{ EmployerKey: string }>("SELECT EmployerKey FROM dbo.CompanyFacts")).map((r) => r.EmployerKey),
  );
  const missing = [...new Map(names.map((n) => [employerKey(n.EmployerName), n.EmployerName])).entries()].filter(
    ([k]) => !known.has(k),
  );
  let found = 0;
  for (const [, name] of missing) {
    try {
      if (await getCompanyFacts(name)) found++;
    } catch (err) {
      log(`Wikidata lookup for ${name} failed: ${(err as Error).message}`);
    }
  }
  if (missing.length) log(`Company facts: looked up ${missing.length} employers on Wikidata, ${found} found`);
  return found;
}

export async function getCompanyFacts(employerName: string): Promise<CompanyFacts | null> {
  const key = employerKey(employerName);
  const [cached] = await query<CompanyFacts>(
    "SELECT WikidataId, Label, Description, Employees, Founded, Industries, Country FROM dbo.CompanyFacts WHERE EmployerKey = @key",
    { key },
  );
  if (cached) return cached.WikidataId ? cached : null;

  let facts: CompanyFacts = {
    WikidataId: null,
    Label: null,
    Description: null,
    Employees: null,
    Founded: null,
    Industries: null,
    Country: null,
  };
  // Feed names carry Indian legal suffixes ("Jones Lang Lasalle Property Consultants India Pvt Ltd"): also try the
  // name without them, then its first two words.
  const stripped = employerName
    .replace(/\b(pvt|private|ltd|limited|llp|inc|india|co)\b\.?/gi, " ")
    .replace(/[^\p{L}\p{N}&. ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const names = [...new Set([employerName, stripped, stripped.split(" ").slice(0, 2).join(" ")])].filter((n) => n.length >= 3);
  let company: Entity | undefined;
  for (const name of names) {
    const search = await wikidata({
      action: "wbsearchentities",
      search: name,
      language: "en",
      type: "item",
      limit: "7",
    });
    const ids: string[] = (search.search ?? []).map((s: { id: string }) => s.id);
    if (!ids.length) continue;
    const { entities } = await wikidata({
      action: "wbgetentities",
      ids: ids.join("|"),
      props: "labels|descriptions|claims",
      languages: "en",
    });
    // A business has an industry (P452) or an employee count (P1128); people and given names have neither. Its English
    // name must also start like the employer's: "Conduent" once matched an unlabelled French company.
    const firstWord = stripped.split(" ")[0].toLowerCase();
    company = ids
      .map((id) => entities[id] as Entity)
      .find(
        (e) =>
          e &&
          (values(e, "P452").length || values(e, "P1128").length) &&
          (e.labels?.en?.value ?? "").toLowerCase().startsWith(firstWord),
      );
    if (company) break;
  }
  if (company) {
    const employees = values(company, "P1128").map((v) => Number((v as { amount: string }).amount));
    const inception = values(company, "P571").map((v) => Number((v as { time: string }).time.slice(1, 5)));
    const refIds = [...itemIds(company, "P452"), ...itemIds(company, "P17")].slice(0, 20);
    const labels: Record<string, string> = {};
    if (refIds.length) {
      const ref = await wikidata({
        action: "wbgetentities",
        ids: refIds.join("|"),
        props: "labels",
        languages: "en",
      });
      for (const [id, e] of Object.entries(ref.entities as Record<string, Entity>)) labels[id] = e.labels?.en?.value ?? id;
    }
    facts = {
      WikidataId: company.id,
      Label: company.labels?.en?.value ?? null,
      Description: company.descriptions?.en?.value ?? null,
      // The latest figure is usually the largest; statements are not reliably ordered.
      Employees: employees.length ? Math.max(...employees.filter(Number.isFinite)) : null,
      Founded: inception.find(Number.isFinite) ?? null,
      Industries:
        itemIds(company, "P452")
          .map((id) => labels[id])
          .filter(Boolean)
          .join(", ") || null,
      Country:
        itemIds(company, "P17")
          .map((id) => labels[id])
          .filter(Boolean)[0] ?? null,
    };
  }
  await execute(
    `INSERT dbo.CompanyFacts (EmployerKey, WikidataId, Label, Description, Employees, Founded, Industries, Country)
     VALUES (@key, @WikidataId, @Label, @Description, @Employees, @Founded, @Industries, @Country)`,
    { key, ...facts },
  );
  return facts.WikidataId ? facts : null;
}

const describeFacts = (f: CompanyFacts) =>
  [
    `${f.Label}${f.Description ? ` (${f.Description})` : ""}`,
    f.Industries && `industry: ${f.Industries}`,
    f.Employees && `employees: ${f.Employees.toLocaleString("en-IN")}`,
    f.Founded && `founded ${f.Founded}`,
    f.Country && `country: ${f.Country}`,
  ]
    .filter(Boolean)
    .join("; ");

// ---------- Quality and landing chance (Gemini) ----------

const Gap = z.object({
  gap: z.string().describe("A requirement you do not clearly show yet, e.g. 'Kubernetes in production'"),
  effort: z
    .enum(["small", "medium", "large"])
    .describe("small = days of brushing up or resume wording; medium = weeks; large = months or not realistic"),
  plan: z.string().describe("One sentence: what to do to close it before or during interviews"),
});
export type QualityGap = z.infer<typeof Gap>;

const Quality = z.object({
  jobId: z.number().int(),
  landingChance: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("How likely the candidate gets an offer if they apply well and close the small/medium gaps"),
  qualityScore: z.number().int().min(0).max(100).describe("How good the job is for a principal-level candidate"),
  descriptionQuality: z
    .number()
    .int()
    .min(1)
    .max(5)
    .describe("1 = vague or copy-pasted, 5 = clear role, team, stack and expectations"),
  payStated: z.string().nullable().describe("Pay exactly as the posting states it (e.g. '45-60 LPA'), null if not stated"),
  payAssessment: z
    .enum(["above", "fair", "below", "unknown"])
    .describe("Stated pay versus principal / architect level in India; unknown if not stated"),
  workMode: z.enum(["onsite", "hybrid", "remote", "unknown"]),
  perks: z
    .array(z.string())
    .describe("Work-life benefits the posting states: flexible hours, insurance, leave, learning budget..."),
  employerType: z.enum(["product", "startup", "mnc", "enterprise", "it-services", "consultancy-agency", "unknown"]),
  highlights: z.array(z.string()).max(3).describe("Up to 3 short reasons this is a good job for the candidate"),
  gaps: z.array(Gap).max(4).describe("What stands between the candidate and an offer, most important first"),
  concerns: z.array(z.string()).max(3).describe("Downsides of the job itself (not the candidate's gaps)"),
});
export type QualityDetails = Omit<z.infer<typeof Quality>, "jobId" | "landingChance" | "qualityScore"> & {
  company: CompanyFacts | null;
};

const QUALITY_SYSTEM = `You are a senior career advisor in India helping one principal-level candidate pick jobs worth applying to.
For each posting give two scores:
- landingChance 0-100: how likely this candidate gets an offer, assuming a strong application and that small or medium
  gaps are closed with some extra effort. Hard requirements the candidate cannot meet (a domain licence, a language,
  10 years of a stack they never used) lower it a lot; a posting asking for much less than the candidate has (over-
  qualified) also lowers it.
- qualityScore 0-100: how good the job is: clear description, real scope (architecture ownership, leadership, product
  impact) versus body-shopping, pay if stated, work-life benefits as stated, and the employer (product companies and
  established employers above agencies that hide the client).
Rules: judge only from the posting text and the company facts given. Never guess pay: if the posting does not state it,
payStated is null and payAssessment is unknown. List only perks the posting states. Use employerType unknown when the
text and facts do not tell. employerType is consultancy-agency when the employer named is a job board, staffing or
recruiting firm, or a remote-hiring platform, or the text hires "for our client" or "for a leading company" without
naming who you would work for: such postings are not a company you would join. Write gaps and highlights to the
candidate ("you").`;

type PendingQuality = {
  Id: number;
  Title: string;
  EmployerName: string;
  City: string | null;
  IsRemote: boolean;
  Description: string;
  SalaryText: string | null;
  FitSummary: string | null;
};

/**
 * Eligible for TOP 25: passed your rules (same as Discover), in India or remote, still open, and not in a city you
 * excluded (setting topPicks.excludeCities, e.g. Surat|Hyderabad).
 */
const POOL_WHERE = `j.Status IN (N'new', N'approved') AND j.FitScore IS NOT NULL AND j.DuplicateOfId IS NULL
  AND (j.Country = N'IN' OR j.IsRemote = 1)
  AND COALESCE(j.PostedAt, j.FirstSeenAt) >= DATEADD(DAY, -@maxAgeDays, SYSUTCDATETIME())
  AND CHARINDEX(N'|' + COALESCE(j.City, N'') + N'|', N'|' + @excludedCities + N'|') = 0`;

async function poolParams() {
  const [maxAgeDays, excludedCities] = await Promise.all([
    getNumberSetting("filter.maxAgeDays", 30),
    getStringSetting("topPicks.excludeCities", ""),
  ]);
  return { maxAgeDays, excludedCities };
}

export async function scorePendingQuality(log: (line: string) => void): Promise<{ scored: number; errors: string[] }> {
  const a = (await getProfile())?.analysis;
  if (!a) throw new Error("Analyse your resume on the Profile page first");
  const params = await poolParams();
  const pending = await query<PendingQuality>(
    `SELECT j.Id, j.Title, j.EmployerName, j.City, j.IsRemote, j.Description, j.SalaryText, j.FitSummary
       FROM dbo.JobPostings j WHERE ${POOL_WHERE} AND j.QualityAt IS NULL ORDER BY j.FitScore DESC`,
    params,
  );
  const result = { scored: 0, errors: [] as string[] };
  if (pending.length === 0) return result;
  log(`Rating job quality and landing chance for ${pending.length} postings`);

  const candidate = [
    `${a.headline}. ${a.totalYearsExperience} years, seniority ${a.seniorityLevel}.`,
    `Core skills: ${a.coreSkills.join(", ")}. Also: ${a.secondarySkills.join(", ")}.`,
    `Domains: ${a.domains.join(", ")}. Strengths: ${a.strengths.join("; ")}.`,
    `Known gaps: ${a.gapsToAddress.join("; ")}.`,
  ].join("\n");

  const BATCH = 4;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const facts = new Map<number, CompanyFacts | null>();
    for (const job of batch) {
      try {
        facts.set(job.Id, await getCompanyFacts(job.EmployerName));
      } catch (err) {
        facts.set(job.Id, null);
        log(`Wikidata lookup for ${job.EmployerName} failed: ${(err as Error).message}`);
      }
    }
    const text = batch
      .map((j) => {
        const f = facts.get(j.Id);
        return [
          `### JOB ${j.Id}: ${j.Title} at ${j.EmployerName} (${j.IsRemote ? "remote" : (j.City ?? "location unclear")})`,
          f ? `Company facts (Wikidata): ${describeFacts(f)}` : "Company facts: none found",
          j.SalaryText ? `Salary field: ${j.SalaryText}` : "",
          j.FitSummary ? `Earlier fit assessment: ${j.FitSummary}` : "",
          j.Description.slice(0, 6000),
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    let scores: z.infer<typeof Quality>[];
    let model: string;
    try {
      const response = await generateJson(
        z.object({ results: z.array(Quality) }),
        `CANDIDATE:\n${candidate}\n\nPOSTINGS:\n${text}`,
        QUALITY_SYSTEM,
      );
      scores = response.data.results;
      model = response.model;
    } catch (err) {
      const message = `Quality rating for jobs ${batch.map((j) => j.Id).join(", ")} failed: ${(err as Error).message}`;
      result.errors.push(message);
      log(message);
      continue;
    }
    for (const job of batch) {
      const s = scores.find((x) => x.jobId === job.Id);
      if (!s) continue;
      const { landingChance, qualityScore, ...rest } = s;
      const details: QualityDetails = {
        ...rest,
        jobId: undefined,
        company: facts.get(job.Id) ?? null,
      } as QualityDetails;
      await execute(
        `UPDATE dbo.JobPostings SET LandingChance = @landing, QualityScore = @quality, QualityJson = @json, QualityModel = @model,
                QualityAt = SYSUTCDATETIME() WHERE Id = @id`,
        {
          id: job.Id,
          landing: landingChance,
          quality: qualityScore,
          json: JSON.stringify(details),
          model,
        },
      );
      result.scored++;
    }
    log(`Rated ${Math.min(i + BATCH, pending.length)} of ${pending.length}`);
  }
  return result;
}

// ---------- Ranking ----------

/** Landing the job comes first (user, 2026-10-06): a great job you will not get is not a top pick. */
export const LANDING_WEIGHT = 0.6;
export const topScore = (landing: number, quality: number) =>
  Math.round(LANDING_WEIGHT * landing + (1 - LANDING_WEIGHT) * quality);

export type TopPickJob = JobListItem & {
  EmployerLogo: string | null;
  LandingChance: number;
  QualityScore: number;
  QualityJson: string;
  score: number;
  details: QualityDetails;
};
export type TopCompany = {
  name: string;
  logo: string | null;
  best: TopPickJob;
  others: TopPickJob[];
  score: number;
};

export const TOP_COMPANIES = 25;

export async function listTopCompanies(limit = TOP_COMPANIES): Promise<{
  companies: TopCompany[];
  pool: number;
  agencies: number;
  awaiting: number;
}> {
  const params = await poolParams();
  const [rows, [{ N: awaiting }], cachedFacts] = await Promise.all([
    query<Omit<TopPickJob, "score" | "details"> & { FactsJson: string | null }>(
      `SELECT ${LIST_COLUMNS}, j.EmployerLogo, j.LandingChance, j.QualityScore, j.QualityJson
         FROM ${LIST_FROM} WHERE ${POOL_WHERE} AND j.QualityAt IS NOT NULL`,
      params,
    ),
    query<{ N: number }>(`SELECT COUNT(*) AS N FROM dbo.JobPostings j WHERE ${POOL_WHERE} AND j.QualityAt IS NULL`, params),
    query<CompanyFacts & { EmployerKey: string }>(
      "SELECT EmployerKey, WikidataId, Label, Description, Employees, Founded, Industries, Country FROM dbo.CompanyFacts WHERE WikidataId IS NOT NULL",
    ),
  ]);
  // Company facts can be looked up after the job was rated (e.g. Wikidata was busy then): use the cache.
  const facts = new Map(cachedFacts.map((f) => [f.EmployerKey, f]));
  const jobs: TopPickJob[] = rows
    .map((r) => {
      const details = JSON.parse(r.QualityJson) as QualityDetails;
      details.company = facts.get(employerKey(r.EmployerName)) ?? details.company ?? null;
      return {
        ...r,
        score: topScore(r.LandingChance, r.QualityScore),
        details,
      };
    })
    .sort((a, b) => b.score - a.score);

  const byCompany = new Map<string, TopPickJob[]>();
  for (const job of jobs.filter((j) => j.details.employerType !== "consultancy-agency")) {
    const key = employerKey(job.EmployerName);
    byCompany.set(key, [...(byCompany.get(key) ?? []), job]);
  }
  const companies = [...byCompany.values()]
    .map(([best, ...others]) => ({
      name: best.EmployerName,
      logo: [best, ...others].find((j) => j.EmployerLogo)?.EmployerLogo ?? null,
      best,
      others,
      score: best.score,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return {
    companies,
    pool: jobs.length,
    agencies: jobs.filter((j) => j.details.employerType === "consultancy-agency").length,
    awaiting,
  };
}
