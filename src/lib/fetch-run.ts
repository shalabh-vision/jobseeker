import { execute, query } from "./db";
import { applyRules, dedupeKey, normaliseEmployer } from "./job-rules";
import { searchJobs, type JSearchJob } from "./jsearch";
import { getProfile } from "./profile";
import { scorePendingJobs } from "./scoring";
import { getTargetLocations, isRefinementStale, listSearchQueries, refineQueries, REMOTE } from "./searches";
import { getNumberSetting, getStringSetting } from "./settings";
import { detectStacks } from "./stacks";
import { fillMissingCompanyFacts, listTopPickQueries, scorePendingQuality } from "./top-picks";
import { asRuleLocations, listVacancyCities, pickVacancyQueries, tagUntaggedStacks } from "./vacancies";

export type FetchRun = {
  Id: number;
  Trigger: "manual" | "scheduled";
  Status: "running" | "succeeded" | "partial" | "failed";
  StartedAt: Date;
  FinishedAt: Date | null;
  Refined: boolean;
  QueriesRun: number;
  ApiRequestsUsed: number;
  ApiRequestsRemaining: number | null;
  JobsReturned: number;
  JobsNew: number;
  JobsDuplicate: number;
  JobsFiltered: number;
  JobsScored: number;
  ErrorText: string | null;
  LogText: string | null;
  CitiesOnly: string | null;
};

const RUN_COLUMNS = `Id, [Trigger], Status, StartedAt, FinishedAt, Refined, QueriesRun, ApiRequestsUsed, ApiRequestsRemaining,
  JobsReturned, JobsNew, JobsDuplicate, JobsFiltered, JobsScored, ErrorText, LogText, CitiesOnly`;

export async function listFetchRuns(limit = 30): Promise<FetchRun[]> {
  return query<FetchRun>(`SELECT TOP (@limit) ${RUN_COLUMNS} FROM dbo.FetchRuns ORDER BY Id DESC`, { limit });
}

export async function getRunningFetch(): Promise<FetchRun | null> {
  const [run] = await query<FetchRun>(`SELECT TOP 1 ${RUN_COLUMNS} FROM dbo.FetchRuns WHERE Status = N'running' ORDER BY Id DESC`);
  return run ?? null;
}

/** When the next automatic fetch is due: interval after the last run that reached the job feed. */
export async function getNextDueAt(): Promise<Date | null> {
  const intervalDays = await getNumberSetting("fetch.intervalDays", 3);
  const [row] = await query<{ StartedAt: Date }>(
    // Runs that searched only picked cities (Vacancies page) do not count as the regular fetch.
    "SELECT TOP 1 StartedAt FROM dbo.FetchRuns WHERE Status IN (N'succeeded', N'partial') AND CitiesOnly IS NULL ORDER BY Id DESC",
  );
  return row ? new Date(row.StartedAt.getTime() + intervalDays * 86_400_000) : null;
}

const toDate = (s?: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null);

/**
 * One fetch: the Tricity vacancy queries, then the saved-search queries in the remaining request budget, then scoring.
 * With `options.cities` it runs only the vacancy queries for those cities (picked on the Vacancies page); with
 * `options.topPicks` only the India-wide queries for your roles (TOP 25). Both end with scoring as usual.
 */
export async function runFetch(
  trigger: "manual" | "scheduled",
  print: (line: string) => void = console.log,
  options: { cities?: string[]; topPicks?: boolean } = {},
): Promise<FetchRun> {
  // A run left 'running' for over an hour crashed; do not let it block new runs forever.
  await execute(
    `UPDATE dbo.FetchRuns SET Status = N'failed', FinishedAt = SYSUTCDATETIME(),
            ErrorText = COALESCE(ErrorText, N'Run stopped unexpectedly (process ended)')
      WHERE Status = N'running' AND StartedAt < DATEADD(HOUR, -1, SYSUTCDATETIME())`,
  );
  if (await getRunningFetch()) throw new Error("A fetch is already running");

  const citiesOnly = options.cities?.length ? options.cities : null;
  const topPicksOnly = !!options.topPicks;
  // A partial run searches only part of the queries and does not count as the weekly fetch.
  const partial = !!citiesOnly || topPicksOnly;
  const [created] = await query<{ Id: number }>(
    "INSERT dbo.FetchRuns ([Trigger], Status, CitiesOnly) OUTPUT inserted.Id VALUES (@trigger, N'running', @cities)",
    { trigger, cities: topPicksOnly ? "India-wide top picks" : (citiesOnly?.join(", ") ?? null) },
  );
  const runId = created.Id;
  const lines: string[] = [];
  const log = (line: string) => {
    const stamped = `${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}  ${line}`;
    lines.push(stamped);
    print(stamped);
  };
  const c = { refined: false, queriesRun: 0, used: 0, remaining: null as number | null, returned: 0, inserted: 0, duplicate: 0, filtered: 0, scored: 0 };
  const errors: string[] = [];

  const saveProgress = (status = "running", errorText: string | null = null) =>
    execute(
      `UPDATE dbo.FetchRuns SET Status = @status, Refined = @refined, QueriesRun = @queriesRun, ApiRequestsUsed = @used,
              ApiRequestsRemaining = @remaining, JobsReturned = @returned, JobsNew = @inserted, JobsDuplicate = @duplicate,
              JobsFiltered = @filtered, JobsScored = @scored, LogText = @log, ErrorText = @errorText,
              FinishedAt = CASE WHEN @status = N'running' THEN NULL ELSE SYSUTCDATETIME() END
        WHERE Id = @id`,
      { id: runId, status, ...c, log: lines.join("\n"), errorText },
    );

  try {
    log(
      `Fetch run #${runId} started (${trigger}` +
        `${topPicksOnly ? ", India-wide top picks only" : citiesOnly ? `, vacancies in ${citiesOnly.join(", ")} only` : ""})`,
    );
    const profile = await getProfile();
    if (!profile?.analysis) throw new Error("Analyse your resume on the Profile page first");

    const tagged = await tagUntaggedStacks();
    if (tagged) log(`Tagged ${tagged} older postings with their tech stacks`);

    if (!partial && (await isRefinementStale())) {
      log("Saved searches changed since the last refinement: asking Gemini to refine the queries first");
      const r = await refineQueries();
      c.refined = true;
      log(`Refined by ${r.Model}: ${r.Summary}`);
    }

    const [maxRequests, datePosted, vacancyDatePosted, maxAgeDays, locations, vacancyCities, vacancyQueries, blocks] =
      await Promise.all([
        getNumberSetting("fetch.maxRequestsPerRun", 18),
        getStringSetting("fetch.datePosted", "week"),
        getStringSetting("vacancies.datePosted", "month"),
        getNumberSetting("filter.maxAgeDays", 30),
        getTargetLocations(),
        listVacancyCities(),
        topPicksOnly ? Promise.resolve([]) : pickVacancyQueries(citiesOnly ?? undefined),
        query<{ Kind: string; Value: string }>("SELECT Kind, [Value] FROM dbo.BlockRules"),
      ]);
    const excludeTitleWords = [
      ...profile.analysis.excludeKeywords,
      ...blocks.filter((b) => b.Kind === "keyword").map((b) => b.Value),
    ];
    const blockedEmployers = blocks.filter((b) => b.Kind === "employer").map((b) => normaliseEmployer(b.Value));

    // Each search: one JSearch request, then every posting goes through the rules and is stored.
    let quotaGone = false;
    const runSearch = async (
      text: string,
      label: string,
      search: { remote: boolean; datePosted: string; country?: string },
      source: Parameters<typeof storeJob>[1],
      ctx: Parameters<typeof storeJob>[3],
      markRun: () => Promise<unknown>,
    ) => {
      let jobs: JSearchJob[];
      try {
        const result = await searchJobs({ query: text, ...search });
        jobs = result.jobs;
        c.used++;
        c.remaining = result.requestsRemaining ?? c.remaining;
      } catch (err) {
        const message = `"${text}" failed: ${(err as Error).message}`;
        errors.push(message);
        log(message);
        // Out of quota or bad key: further requests will fail the same way.
        if (/JSearch (401|403|429)/.test(message)) quotaGone = true;
        return;
      }
      c.queriesRun++;
      c.returned += jobs.length;
      const before = { inserted: c.inserted, duplicate: c.duplicate, filtered: c.filtered };
      for (const job of jobs) await storeJob(job, source, runId, ctx, c);
      await markRun();
      log(
        `"${text}"${label}: ${jobs.length} postings, ${c.inserted - before.inserted} new ` +
          `(${c.filtered - before.filtered} filtered by rules), ${c.duplicate - before.duplicate} already known`,
      );
      await saveProgress();
    };

    // TOP 25: the profile's roles anywhere in India (only when started from that page).
    if (topPicksOnly) {
      const topQueries = await listTopPickQueries();
      log(`Running ${topQueries.length} India-wide queries for your roles, postings from the past ${vacancyDatePosted}`);
      for (const tq of topQueries) {
        if (quotaGone) break;
        const remote = tq.WorkMode === "remote";
        await runSearch(
          remote ? `${tq.QueryText} remote` : `${tq.QueryText} in India`,
          " (top picks)",
          { remote, datePosted: vacancyDatePosted },
          { topPickQueryId: tq.Id },
          { locations, remote, anywhereInIndia: true, excludeTitleWords, blockedEmployers, maxAgeDays },
          () => execute("UPDATE dbo.TopPickQueries SET LastRunAt = SYSUTCDATETIME() WHERE Id = @id", { id: tq.Id }),
        );
      }
    }

    // Vacancy queries: a posting counts if it is in one of the vacancy cities (not only your Discover cities).
    const vacancyCtx = { locations: asRuleLocations(vacancyCities), remote: false, excludeTitleWords, blockedEmployers, maxAgeDays };
    if (vacancyQueries.length) log(`Running ${vacancyQueries.length} vacancy queries, postings from the past ${vacancyDatePosted}`);
    for (const vq of vacancyQueries) {
      if (quotaGone) break;
      await runSearch(
        `${vq.QueryText} in ${vq.City}`,
        " (vacancies)",
        { remote: false, datePosted: vacancyDatePosted, country: vq.Country.trim() },
        { vacancyQueryId: vq.Id },
        vacancyCtx,
        () => execute("UPDATE dbo.VacancyQueries SET LastRunAt = SYSUTCDATETIME() WHERE Id = @id", { id: vq.Id }),
      );
    }

    // The vacancy queries share the per-run request budget with your saved searches.
    const savedBudget = partial || quotaGone ? 0 : Math.max(0, maxRequests - vacancyQueries.length);
    const queries = (await listSearchQueries())
      .filter((q) => q.Status === "active")
      .sort((x, y) => x.Priority - y.Priority || (x.LastRunAt?.getTime() ?? 0) - (y.LastRunAt?.getTime() ?? 0))
      .slice(0, savedBudget);
    if (!partial && !quotaGone && queries.length === 0) throw new Error("No active search queries. Check the Searches page.");
    if (queries.length) log(`Running ${queries.length} saved-search queries (budget ${savedBudget}), postings from the past ${datePosted}`);
    for (const q of queries) {
      if (quotaGone) break;
      const remote = q.Location === REMOTE;
      await runSearch(
        remote ? `${q.QueryText} remote` : `${q.QueryText} in ${q.Location}`,
        "",
        { remote, datePosted },
        { searchQueryId: q.Id },
        { locations, remote, excludeTitleWords, blockedEmployers, maxAgeDays },
        () => execute("UPDATE dbo.SearchQueries SET LastRunAt = SYSUTCDATETIME() WHERE Id = @id", { id: q.Id }),
      );
    }
    if (c.remaining !== null) log(`JSearch requests left this month: ${c.remaining}`);

    log("Scoring new postings with Gemini");
    const scoring = await scorePendingJobs(log);
    c.scored = scoring.scored;
    c.filtered += scoring.filtered;
    errors.push(...scoring.errors);

    // Job quality and landing chance for TOP 25: only postings that passed the rules above.
    const quality = await scorePendingQuality(log);
    errors.push(...quality.errors);
    await fillMissingCompanyFacts(log);

    const status = errors.length === 0 ? "succeeded" : c.queriesRun > 0 ? "partial" : "failed";
    log(`Finished: ${c.inserted} new postings, ${c.scored} scored, ${c.filtered} filtered out${errors.length ? `, ${errors.length} errors` : ""}`);
    await saveProgress(status, errors.length ? errors.join("\n") : null);
  } catch (err) {
    log(`Run failed: ${(err as Error).message}`);
    await saveProgress("failed", [...errors, (err as Error).message].join("\n"));
  }
  const [run] = await query<FetchRun>(`SELECT ${RUN_COLUMNS} FROM dbo.FetchRuns WHERE Id = @id`, { id: runId });
  return run;
}

type Counters = { inserted: number; duplicate: number; filtered: number };

async function storeJob(
  job: JSearchJob,
  source: { searchQueryId?: number; vacancyQueryId?: number; topPickQueryId?: number },
  runId: number,
  ctx: Parameters<typeof applyRules>[1],
  c: Counters,
) {
  const externalId = (job.job_uid || job.job_id).slice(0, 300);
  const seen = await execute(
    "UPDATE dbo.JobPostings SET LastSeenAt = SYSUTCDATETIME() WHERE Source = N'jsearch' AND ExternalId = @externalId",
    { externalId },
  );
  if (seen > 0) {
    c.duplicate++;
    return;
  }

  const outcome = applyRules(job, ctx);
  const key = dedupeKey(job, outcome.city, ctx.locations);
  let status: string = outcome.status;
  let stage = outcome.status === "filtered" ? outcome.stage : null;
  let reason = outcome.status === "filtered" ? outcome.reason : null;
  let duplicateOf: number | null = null;

  const [original] = await query<{ Id: number; Publisher: string | null }>(
    "SELECT TOP 1 Id, Publisher FROM dbo.JobPostings WHERE DedupeKey = @key AND DuplicateOfId IS NULL ORDER BY Id",
    { key },
  );
  if (original) {
    [status, stage, reason, duplicateOf] = ["filtered", "duplicate", `Same job already found on ${original.Publisher ?? "another board"}`, original.Id];
  }

  const salary =
    job.job_salary ??
    (job.job_min_salary ? `${job.job_min_salary}${job.job_max_salary ? `–${job.job_max_salary}` : ""} ${job.job_salary_period ?? ""}`.trim() : null);

  await execute(
    `INSERT dbo.JobPostings (Source, ExternalId, DedupeKey, DuplicateOfId, Title, EmployerName, EmployerWebsite, EmployerLogo,
            City, State, Country, IsRemote, EmploymentType, PostedAt, Publisher, ApplyLink, ApplyIsDirect, ApplyOptionsJson,
            GoogleLink, Description, HighlightsJson, SalaryMin, SalaryMax, SalaryPeriod, SalaryText, RawJson, SearchQueryId,
            VacancyQueryId, TopPickQueryId, FetchRunId, Status, FilterStage, FilterReason, RedFlagsJson, Stacks)
     VALUES (N'jsearch', @externalId, @key, @duplicateOf, @title, @employer, @website, @logo, @city, @state, @country, @remote,
            @type, @postedAt, @publisher, @applyLink, @applyDirect, @applyOptions, @googleLink, @description, @highlights,
            @salaryMin, @salaryMax, @salaryPeriod, @salaryText, @raw, @queryId, @vacancyQueryId, @topPickQueryId, @runId, @status, @stage, @reason,
            @redFlags, @stacks)`,
    {
      externalId,
      key,
      duplicateOf,
      title: job.job_title.slice(0, 400),
      employer: (job.employer_name || "Unknown employer").slice(0, 300),
      website: job.employer_website ?? null,
      logo: job.employer_logo ?? null,
      // Store the matched target city so aliases like "Sahibzada Ajit Singh Nagar" show as Mohali.
      city: outcome.city ?? job.job_city ?? null,
      state: job.job_state ?? null,
      country: job.job_country ?? null,
      remote: !!job.job_is_remote,
      type: job.job_employment_type ?? null,
      postedAt: toDate(job.job_posted_at_datetime_utc),
      publisher: job.job_publisher ?? null,
      applyLink: job.job_apply_link ?? null,
      applyDirect: job.job_apply_is_direct ?? null,
      applyOptions: job.apply_options ? JSON.stringify(job.apply_options) : null,
      googleLink: job.job_google_link ?? null,
      description: job.job_description ?? "",
      highlights: job.job_highlights && Object.keys(job.job_highlights).length ? JSON.stringify(job.job_highlights) : null,
      salaryMin: job.job_min_salary ?? null,
      salaryMax: job.job_max_salary ?? null,
      salaryPeriod: job.job_salary_period ?? null,
      salaryText: salary,
      raw: JSON.stringify(job),
      queryId: source.searchQueryId ?? null,
      vacancyQueryId: source.vacancyQueryId ?? null,
      topPickQueryId: source.topPickQueryId ?? null,
      stacks: detectStacks(job.job_title, job.job_description ?? ""),
      runId,
      status,
      stage,
      reason,
      redFlags: JSON.stringify(outcome.redFlags),
    },
  );
  c.inserted++;
  if (status === "filtered") {
    if (stage === "duplicate") c.duplicate++;
    else c.filtered++;
  }
}
