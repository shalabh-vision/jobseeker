// Re-applies the current resume analysis to everything matched against the profile. Run after a new resume is
// analysed (2026-10-15: updated resume with Vision Solutions work). No job-feed requests; Gemini only.
//   1. Fit scores for every posting Gemini judged (new, or filtered for fit / seniority / spam). Postings you approved or
//      rejected are re-scored too, then your decision is put back exactly as it was.
//   2. Quality and landing-chance ratings (TOP 25, Employers).
//   3. Career map cities and the SWOT / best role.
//   4. Saved searches and India-wide queries get the roles the new analysis suggests (used at the next fetch).
// Usage: npm run rescore
import { closePool, execute, query } from "../src/lib/db";
import { refreshCities } from "../src/lib/career/cities";
import { refreshSwot } from "../src/lib/career/swot";
import { getProfile } from "../src/lib/profile";
import { scorePendingJobs } from "../src/lib/scoring";
import { importSuggestedRoles } from "../src/lib/searches";
import { scorePendingQuality } from "../src/lib/top-picks";

const log = (line: string) => console.log(`${new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata" })}  ${line}`);
const GEMINI_STAGES = "N'fit', N'seniority', N'scam'";

async function main() {
  const analysis = (await getProfile())?.analysis;
  if (!analysis) throw new Error("Analyse the resume on the Profile page first");
  log(`Profile: ${analysis.headline}`);

  // Decisions to restore after scoring.
  const decided = await query<{ Id: number; Status: string; FilterStage: string | null; FilterReason: string | null; DecidedAt: Date | null; RejectReason: string | null }>(
    "SELECT Id, Status, FilterStage, FilterReason, DecidedAt, RejectReason FROM dbo.JobPostings WHERE Status IN (N'approved', N'rejected')",
  );
  const reset = await execute(
    `UPDATE dbo.JobPostings SET Status = N'new', FilterStage = NULL, FilterReason = NULL, ScoredAt = NULL, QualityAt = NULL
      WHERE DuplicateOfId IS NULL AND (Status IN (N'new', N'approved', N'rejected') OR (Status = N'filtered' AND FilterStage IN (${GEMINI_STAGES})))`,
  );
  log(`Re-scoring ${reset} postings (${decided.length} with your decisions kept)`);

  try {
    const fit = await scorePendingJobs(log);
    log(`Fit: ${fit.scored} scored, ${fit.filtered} filtered out, ${fit.errors.length} errors`);
  } finally {
    for (const d of decided) {
      await execute(
        "UPDATE dbo.JobPostings SET Status = @Status, FilterStage = @FilterStage, FilterReason = @FilterReason, DecidedAt = @DecidedAt, RejectReason = @RejectReason WHERE Id = @Id",
        d,
      );
    }
    log(`Restored ${decided.length} approve / reject decisions`);
  }

  const quality = await scorePendingQuality(log);
  log(`Quality: ${quality.scored} rated, ${quality.errors.length} errors`);

  await refreshCities();
  log("Career map cities recounted");
  const swot = await refreshSwot();
  log(`SWOT rebuilt; best next role: ${swot.role.recommended}`);

  const added = await importSuggestedRoles();
  log(`Saved searches: ${added} suggested role(s) added (queries are refined at the next fetch)`);
  const existing = new Set((await query<{ QueryText: string }>("SELECT QueryText FROM dbo.TopPickQueries")).map((q) => q.QueryText.toLowerCase()));
  let topAdded = 0;
  for (const r of analysis.suitableRoles) {
    const text = r.title.replace(/[^A-Za-z0-9.+# /-]/g, "").replace(/\s+-\s+/g, " ").trim();
    if (existing.has(text.toLowerCase())) continue;
    await execute("INSERT dbo.TopPickQueries (QueryText, WorkMode) VALUES (@text, N'india')", { text });
    existing.add(text.toLowerCase());
    topAdded++;
  }
  log(`India-wide TOP 25 queries: ${topAdded} added`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closePool);
