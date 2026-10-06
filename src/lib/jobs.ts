import { execute, query } from "./db";

export type JobTab = "new" | "approved" | "filtered" | "rejected";

export type JobListItem = {
  Id: number;
  Title: string;
  EmployerName: string;
  City: string | null;
  IsRemote: boolean;
  PostedAt: Date | null;
  Publisher: string | null;
  SalaryText: string | null;
  Status: JobTab;
  FitScore: number | null;
  FitSummary: string | null;
  RedFlagsJson: string | null;
  FilterStage: string | null;
  FilterReason: string | null;
  RejectReason: string | null;
  Industry: string | null;
  IndustryMatch: boolean | null;
  RequiredYears: number | null;
  FirstSeenAt: Date;
  DecidedAt: Date | null;
  SearchQueryText: string | null;
  AppliedOn: Date | null;
  ApplicationStatus: string | null;
};

export type JobDetail = JobListItem & {
  EmployerWebsite: string | null;
  EmploymentType: string | null;
  ApplyLink: string | null;
  ApplyIsDirect: boolean | null;
  ApplyOptionsJson: string | null;
  GoogleLink: string | null;
  Description: string;
  HighlightsJson: string | null;
  FitReasonsJson: string | null;
  ScoreModel: string | null;
  DuplicateOfId: number | null;
  LastSeenAt: Date;
};

export const LIST_COLUMNS = `j.Id, j.Title, j.EmployerName, j.City, j.IsRemote, j.PostedAt, j.Publisher, j.SalaryText, j.Status,
  j.FitScore, j.FitSummary, j.RedFlagsJson, j.FilterStage, j.FilterReason, j.RejectReason, j.Industry, j.IndustryMatch,
  j.RequiredYears, j.FirstSeenAt, j.DecidedAt,
  CASE WHEN q.Id IS NULL THEN NULL WHEN q.Location = N'Remote' THEN q.QueryText + N' (remote)'
       ELSE q.QueryText + N' in ' + q.Location END AS SearchQueryText,
  a.AppliedOn, a.Status AS ApplicationStatus`;
export const LIST_FROM = `dbo.JobPostings j
  LEFT JOIN dbo.SearchQueries q ON q.Id = j.SearchQueryId
  LEFT JOIN dbo.Applications a ON a.JobPostingId = j.Id`;

// Discover reviews your own cities: vacancy and TOP 25 postings from other cities (Bengaluru, Silicon Valley...) stay on the
// Vacancies tab unless you approve or reject one there.
const DISCOVER_SCOPE = `((j.VacancyQueryId IS NULL AND j.TopPickQueryId IS NULL) OR j.Status IN (N'approved', N'rejected')
  OR j.City IN (SELECT City FROM dbo.TargetLocations WHERE IsActive = 1))`;

export async function countJobsByStatus(): Promise<Record<JobTab, number>> {
  const rows = await query<{ Status: JobTab; N: number }>(
    `SELECT j.Status, COUNT(*) AS N FROM dbo.JobPostings j WHERE ${DISCOVER_SCOPE} GROUP BY j.Status`,
  );
  const counts: Record<JobTab, number> = { new: 0, approved: 0, filtered: 0, rejected: 0 };
  for (const r of rows) counts[r.Status] = r.N;
  return counts;
}

export async function listJobs(status: JobTab, filterStage?: string): Promise<JobListItem[]> {
  // New jobs: best fit first. Decided or filtered jobs: most recent first.
  const order = status === "new" ? "j.FitScore DESC, j.PostedAt DESC" : "COALESCE(j.DecidedAt, j.FirstSeenAt) DESC, j.FitScore DESC";
  return query<JobListItem>(
    `SELECT TOP 500 ${LIST_COLUMNS}
       FROM ${LIST_FROM}
      WHERE j.Status = @status AND (@stage IS NULL OR j.FilterStage = @stage) AND ${DISCOVER_SCOPE}
      ORDER BY ${order}`,
    { status, stage: filterStage ?? null },
  );
}

export async function countFilteredByStage(): Promise<{ FilterStage: string; N: number }[]> {
  return query(
    `SELECT j.FilterStage, COUNT(*) AS N FROM dbo.JobPostings j WHERE j.Status = N'filtered' AND ${DISCOVER_SCOPE}
      GROUP BY j.FilterStage ORDER BY N DESC`,
  );
}

export async function getJob(id: number): Promise<JobDetail | null> {
  const [job] = await query<JobDetail>(
    `SELECT ${LIST_COLUMNS}, j.EmployerWebsite, j.EmploymentType, j.ApplyLink, j.ApplyIsDirect, j.ApplyOptionsJson, j.GoogleLink, j.Description,
            j.HighlightsJson, j.FitReasonsJson, j.ScoreModel, j.DuplicateOfId, j.LastSeenAt
       FROM ${LIST_FROM}
      WHERE j.Id = @id`,
    { id },
  );
  return job ?? null;
}

export async function approveJob(id: number) {
  await execute(
    "UPDATE dbo.JobPostings SET Status = N'approved', RejectReason = NULL, DecidedAt = SYSUTCDATETIME() WHERE Id = @id",
    { id },
  );
}

/** Rejecting can also block the employer so future postings from them are filtered automatically. */
export async function rejectJob(id: number, reason: string, blockEmployer: boolean) {
  await execute(
    "UPDATE dbo.JobPostings SET Status = N'rejected', RejectReason = @reason, DecidedAt = SYSUTCDATETIME() WHERE Id = @id",
    { id, reason: reason.trim() || null },
  );
  if (blockEmployer) {
    await execute(
      `INSERT dbo.BlockRules (Kind, [Value], Note)
       SELECT N'employer', j.EmployerName, @reason FROM dbo.JobPostings j
        WHERE j.Id = @id AND NOT EXISTS (SELECT 1 FROM dbo.BlockRules b WHERE b.Kind = N'employer' AND b.[Value] = j.EmployerName)`,
      { id, reason: reason.trim() || "Blocked when rejecting a job" },
    );
  }
}

/** Puts a filtered or rejected job back in the New list for review. */
export async function restoreJob(id: number) {
  await execute(
    "UPDATE dbo.JobPostings SET Status = N'new', RejectReason = NULL, DecidedAt = NULL WHERE Id = @id",
    { id },
  );
}

export type BlockRule = { Id: number; Kind: "employer" | "keyword"; Value: string; Note: string | null; CreatedAt: Date };

export async function listBlockRules(): Promise<BlockRule[]> {
  return query<BlockRule>("SELECT Id, Kind, [Value], Note, CreatedAt FROM dbo.BlockRules ORDER BY Kind, [Value]");
}

export async function addBlockRule(kind: "employer" | "keyword", value: string) {
  if (!value.trim()) throw new Error("Enter a value to block");
  await execute(
    `IF NOT EXISTS (SELECT 1 FROM dbo.BlockRules WHERE Kind = @kind AND [Value] = @value)
       INSERT dbo.BlockRules (Kind, [Value], Note) VALUES (@kind, @value, N'Added by you')`,
    { kind, value: value.trim() },
  );
}

export async function deleteBlockRule(id: number) {
  await execute("DELETE dbo.BlockRules WHERE Id = @id", { id });
}

export const parseList = (json: string | null): string[] => (json ? (JSON.parse(json) as string[]) : []);
