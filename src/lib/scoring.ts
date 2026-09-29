import { z } from "zod";
import { execute, query } from "./db";
import { generateJson } from "./gemini";
import { getProfile } from "./profile";
import { getNumberSetting } from "./settings";

const BATCH_SIZE = 5;
const MAX_DESCRIPTION_CHARS = 6000;
const STRONG_FIT = 70;

const JobScore = z.object({
  jobId: z.number().int(),
  fitScore: z.number().int().min(0).max(100),
  summary: z.string().describe("1-2 sentences to the candidate (use 'you') on how well this job fits"),
  matches: z.array(z.string()).describe("Concrete requirements the candidate meets"),
  concerns: z.array(z.string()).describe("Requirements the candidate lacks or reasons the fit is weaker"),
  redFlags: z.array(z.string()).describe("Signs the posting is fake, a scam, spam or keyword-stuffed; empty if none"),
  requiredYears: z.number().nullable().describe("Minimum years of experience the posting asks for, null if not stated"),
  industry: z.string().describe("The employer's industry, e.g. IT services, fintech, online dating"),
  industryMatch: z.boolean().describe("True only if the employer is in one of the preferred industries listed for this job"),
  likelyGenuine: z.boolean().describe("False only with clear evidence the posting is fake or a scam"),
});
const ScoreBatch = z.object({ results: z.array(JobScore) });

const SYSTEM = `You are a senior technical recruiter in India screening job postings for one candidate.
Score each posting 0-100 for how well it fits the candidate:
  85-100 excellent: seniority, stack and domain all match; 70-84 good; 55-69 possible; below 55 poor.
Seniority matters: roles far below the candidate's level (e.g. 2-6 years asked) score below 50.
Non-software jobs (civil/building architect, sales, BPO) score below 20.
If the job is really based somewhere other than the listed city (e.g. relocation abroad), score below 40.
If a job lists preferred industries and the employer is in one of them, add up to 10 points and set industryMatch.
Red flags are signs of a fake or low-quality posting: fees, vague or copy-pasted descriptions, title and description
that do not match, keyword stuffing, unrealistic pay, personal email contact, mass consultancy postings with no client
details. Judge only from the posting text; do not invent facts about the employer.`;

type PendingJob = {
  Id: number;
  Title: string;
  EmployerName: string;
  City: string | null;
  IsRemote: boolean;
  Description: string;
  HighlightsJson: string | null;
  SalaryText: string | null;
  RedFlagsJson: string | null;
  Industries: string | null;
};

export type ScoringResult = { scored: number; filtered: number; errors: string[] };

export async function scorePendingJobs(log: (line: string) => void): Promise<ScoringResult> {
  const [profile, minFitScore, minRequiredYears] = await Promise.all([
    getProfile(),
    getNumberSetting("filter.minFitScore", 55),
    getNumberSetting("filter.minRequiredYears", 8),
  ]);
  const a = profile?.analysis;
  if (!a) throw new Error("Analyse your resume on the Profile page before scoring jobs");

  // Preferred industries come from the saved searches behind the query that found each job.
  const pending = await query<PendingJob>(
    `SELECT j.Id, j.Title, j.EmployerName, j.City, j.IsRemote, j.Description, j.HighlightsJson, j.SalaryText, j.RedFlagsJson,
            (SELECT STRING_AGG(NULLIF(s.Industries, N''), N'; ') FROM dbo.SearchQuerySources qs
               JOIN dbo.SavedSearches s ON s.Id = qs.SavedSearchId WHERE qs.SearchQueryId = j.SearchQueryId) AS Industries
       FROM dbo.JobPostings j
      WHERE j.Status = N'new' AND j.ScoredAt IS NULL
      ORDER BY j.Id`,
  );
  const candidate = [
    `${a.candidateName}: ${a.headline}`,
    `${a.totalYearsExperience} years in software/IT, seniority ${a.seniorityLevel}.`,
    `Core skills: ${a.coreSkills.join(", ")}. Also: ${a.secondarySkills.join(", ")}.`,
    `Domains: ${a.domains.join(", ")}.`,
    `Roles that suit: ${a.suitableRoles.map((r) => r.title).join(", ")}.`,
  ].join("\n");

  const result: ScoringResult = { scored: 0, filtered: 0, errors: [] };
  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const jobsText = batch
      .map((j) =>
        [
          `### JOB ${j.Id}: ${j.Title} at ${j.EmployerName} (${j.IsRemote ? "remote" : (j.City ?? "location unclear")})`,
          j.Industries ? `Preferred industries for this job: ${j.Industries}` : "",
          j.SalaryText ? `Salary: ${j.SalaryText}` : "",
          j.Description.slice(0, MAX_DESCRIPTION_CHARS),
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n");

    let scores: z.infer<typeof JobScore>[];
    let model: string;
    try {
      const response = await generateJson(ScoreBatch, `CANDIDATE:\n${candidate}\n\nPOSTINGS:\n${jobsText}`, SYSTEM);
      scores = response.data.results;
      model = response.model;
    } catch (err) {
      // Leave the batch unscored; the next run picks it up again.
      const message = `Scoring jobs ${batch.map((j) => j.Id).join(", ")} failed: ${(err as Error).message}`;
      result.errors.push(message);
      log(message);
      continue;
    }

    for (const job of batch) {
      const s = scores.find((x) => x.jobId === job.Id);
      if (!s) {
        log(`Gemini returned no score for job ${job.Id}; will retry next run`);
        continue;
      }
      const redFlags = [...new Set([...(job.RedFlagsJson ? (JSON.parse(job.RedFlagsJson) as string[]) : []), ...s.redFlags])];
      let status: "new" | "filtered" = "new";
      let stage: string | null = null;
      let reason: string | null = null;
      if (!s.likelyGenuine) {
        [status, stage, reason] = ["filtered", "scam", `Looks fake or spam: ${s.redFlags.join("; ") || "see red flags"}`];
      } else if (s.requiredYears !== null && s.requiredYears < minRequiredYears && s.fitScore < STRONG_FIT) {
        // Many senior postings state a low minimum ("4+ years"); trust a strong score over the number.
        [status, stage, reason] = ["filtered", "seniority", `Asks for ${s.requiredYears}+ years; too junior for you`];
      } else if (s.fitScore < minFitScore) {
        [status, stage, reason] = ["filtered", "fit", `Fit score ${s.fitScore} is below ${minFitScore}`];
      }

      await execute(
        `UPDATE dbo.JobPostings SET FitScore = @score, FitSummary = @summary, FitReasonsJson = @reasons,
                RedFlagsJson = @redFlags, RequiredYears = @years, Industry = @industry, IndustryMatch = @industryMatch,
                ScoreModel = @model, ScoredAt = SYSUTCDATETIME(), Status = @status, FilterStage = @stage, FilterReason = @reason
          WHERE Id = @id`,
        {
          id: job.Id,
          score: s.fitScore,
          summary: s.summary,
          reasons: JSON.stringify({ matches: s.matches, concerns: s.concerns }),
          redFlags: JSON.stringify(redFlags),
          years: s.requiredYears,
          industry: s.industry,
          industryMatch: s.industryMatch,
          model,
          status,
          stage,
          reason,
        },
      );
      result.scored++;
      if (status === "filtered") result.filtered++;
    }
    log(`Scored ${Math.min(i + BATCH_SIZE, pending.length)} of ${pending.length} jobs`);
  }
  return result;
}
