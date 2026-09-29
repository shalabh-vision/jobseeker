import { execute, query } from "./db";
import { applyRules, dedupeKey, normaliseEmployer } from "./job-rules";
import { searchJobs, type JSearchJob } from "./jsearch";
import { getProfile } from "./profile";
import { scorePendingJobs } from "./scoring";
import { getTargetLocations, isRefinementStale, listSearchQueries, refineQueries, REMOTE, type SearchQuery } from "./searches";
import { getNumberSetting, getStringSetting } from "./settings";

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
};

const RUN_COLUMNS = `Id, [Trigger], Status, StartedAt, FinishedAt, Refined, QueriesRun, ApiRequestsUsed, ApiRequestsRemaining,
  JobsReturned, JobsNew, JobsDuplicate, JobsFiltered, JobsScored, ErrorText, LogText`;

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
    "SELECT TOP 1 StartedAt FROM dbo.FetchRuns WHERE Status IN (N'succeeded', N'partial') ORDER BY Id DESC",
  );
  return row ? new Date(row.StartedAt.getTime() + intervalDays * 86_400_000) : null;
}

const toDate = (s?: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null);

export async function runFetch(trigger: "manual" | "scheduled", print: (line: string) => void = console.log): Promise<FetchRun> {
  // A run left 'running' for over an hour crashed; do not let it block new runs forever.
  await execute(
    `UPDATE dbo.FetchRuns SET Status = N'failed', FinishedAt = SYSUTCDATETIME(),
            ErrorText = COALESCE(ErrorText, N'Run stopped unexpectedly (process ended)')
      WHERE Status = N'running' AND StartedAt < DATEADD(HOUR, -1, SYSUTCDATETIME())`,
  );
  if (await getRunningFetch()) throw new Error("A fetch is already running");

  const [created] = await query<{ Id: number }>(
    "INSERT dbo.FetchRuns ([Trigger], Status) OUTPUT inserted.Id VALUES (@trigger, N'running')",
    { trigger },
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
    log(`Fetch run #${runId} started (${trigger})`);
    const profile = await getProfile();
    if (!profile?.analysis) throw new Error("Analyse your resume on the Profile page first");

    if (await isRefinementStale()) {
      log("Saved searches changed since the last refinement: asking Gemini to refine the queries first");
      const r = await refineQueries();
      c.refined = true;
      log(`Refined by ${r.Model}: ${r.Summary}`);
    }

    const [maxRequests, datePosted, maxAgeDays, locations, blocks] = await Promise.all([
      getNumberSetting("fetch.maxRequestsPerRun", 18),
      getStringSetting("fetch.datePosted", "week"),
      getNumberSetting("filter.maxAgeDays", 30),
      getTargetLocations(),
      query<{ Kind: string; Value: string }>("SELECT Kind, [Value] FROM dbo.BlockRules"),
    ]);
    const excludeTitleWords = [
      ...profile.analysis.excludeKeywords,
      ...blocks.filter((b) => b.Kind === "keyword").map((b) => b.Value),
    ];
    const blockedEmployers = blocks.filter((b) => b.Kind === "employer").map((b) => normaliseEmployer(b.Value));

    const queries = (await listSearchQueries())
      .filter((q) => q.Status === "active")
      .sort((x, y) => x.Priority - y.Priority || (x.LastRunAt?.getTime() ?? 0) - (y.LastRunAt?.getTime() ?? 0))
      .slice(0, maxRequests);
    if (queries.length === 0) throw new Error("No active search queries. Check the Searches page.");
    log(`Running ${queries.length} queries (budget ${maxRequests}), postings from the past ${datePosted}`);

    for (const q of queries) {
      const remote = q.Location === REMOTE;
      const text = remote ? `${q.QueryText} remote` : `${q.QueryText} in ${q.Location}`;
      let jobs: JSearchJob[];
      try {
        const result = await searchJobs({ query: text, remote, datePosted });
        jobs = result.jobs;
        c.used++;
        c.remaining = result.requestsRemaining ?? c.remaining;
      } catch (err) {
        const message = `"${text}" failed: ${(err as Error).message}`;
        errors.push(message);
        log(message);
        // Out of quota or bad key: further requests will fail the same way.
        if (/JSearch (401|403|429)/.test(message)) break;
        continue;
      }
      c.queriesRun++;
      c.returned += jobs.length;

      const before = { inserted: c.inserted, duplicate: c.duplicate, filtered: c.filtered };
      for (const job of jobs) await storeJob(job, q, runId, { locations, remote, excludeTitleWords, blockedEmployers, maxAgeDays }, c);
      await execute("UPDATE dbo.SearchQueries SET LastRunAt = SYSUTCDATETIME() WHERE Id = @id", { id: q.Id });
      log(
        `"${text}": ${jobs.length} postings, ${c.inserted - before.inserted} new ` +
          `(${c.filtered - before.filtered} filtered by rules), ${c.duplicate - before.duplicate} already known`,
      );
      await saveProgress();
    }
    if (c.remaining !== null) log(`JSearch requests left this month: ${c.remaining}`);

    log("Scoring new postings with Gemini");
    const scoring = await scorePendingJobs(log);
    c.scored = scoring.scored;
    c.filtered += scoring.filtered;
    errors.push(...scoring.errors);

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
  q: SearchQuery,
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
            FetchRunId, Status, FilterStage, FilterReason, RedFlagsJson)
     VALUES (N'jsearch', @externalId, @key, @duplicateOf, @title, @employer, @website, @logo, @city, @state, @country, @remote,
            @type, @postedAt, @publisher, @applyLink, @applyDirect, @applyOptions, @googleLink, @description, @highlights,
            @salaryMin, @salaryMax, @salaryPeriod, @salaryText, @raw, @queryId, @runId, @status, @stage, @reason, @redFlags)`,
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
      queryId: q.Id,
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
