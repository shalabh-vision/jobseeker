import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { HowItWorks } from "@/components/how-it-works";
import { JobCard } from "@/components/job-card";
import { getNextDueAt, listFetchRuns } from "@/lib/fetch-run";
import { formatDateTime } from "@/lib/format";
import { countFilteredByStage, countJobsByStatus, listJobs, type JobTab } from "@/lib/jobs";

export const metadata: Metadata = { title: "Discover" };

const TABS: { tab: JobTab; label: string }[] = [
  { tab: "new", label: "New" },
  { tab: "filtered", label: "Filtered out" },
  { tab: "rejected", label: "Rejected" },
];

const STAGE_LABELS: Record<string, string> = {
  fit: "Low fit score",
  seniority: "Too junior",
  location: "Outside your cities",
  duplicate: "Duplicate",
  title: "Excluded title word",
  type: "Not full-time",
  age: "Too old",
  scam: "Fake / spam",
  blocked: "Blocked employer",
};

export default async function DiscoverPage({ searchParams }: PageProps<"/jobs/discover">) {
  await connection();
  const params = await searchParams;
  const tab = TABS.some((t) => t.tab === params.tab) ? (params.tab as JobTab) : "new";
  const stage = typeof params.stage === "string" ? params.stage : undefined;

  const [jobs, counts, stages, [lastRun], nextDue] = await Promise.all([
    listJobs(tab, tab === "filtered" ? stage : undefined),
    countJobsByStatus(),
    countFilteredByStage(),
    listFetchRuns(1),
    getNextDueAt(),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Discover</h1>
        <p className="text-gray-600">Jobs found by the automatic fetch. Approve the ones you want; they move to Saved jobs.</p>
      </div>

      <HowItWorks>
        <p>Every few days the fetch searches the job feed with your refined queries, then each posting goes through:</p>
        <ul>
          <li>
            <b>Rules</b>: must be full-time, in your cities (or remote for remote searches), posted within 30 days, and not
            contain excluded title words such as &ldquo;junior&rdquo; or &ldquo;intern&rdquo;.
          </li>
          <li>
            <b>Duplicates</b>: the same job listed on several boards is shown once.
          </li>
          <li>
            <b>Gemini scoring</b>: reads the full description against your profile and gives a 0–100 fit score with
            reasons. Scores below 55, likely fakes, and postings asking for under 8 years (unless the fit score is 70+) are
            filtered out.
          </li>
        </ul>
        <p>
          <b>Approve &amp; save</b> keeps the job in your database (Saved jobs). <b>Reject</b> asks why, and can block the
          employer so you never see them again. Nothing is deleted: check <b>Filtered out</b> now and then, and use{" "}
          <b>Move back to New</b> if the filter got it wrong.
        </p>
      </HowItWorks>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200/70 bg-white shadow-sm px-4 py-3 text-sm">
        <span className="text-gray-700">
          {lastRun ? (
            <>
              Last fetch {formatDateTime(lastRun.StartedAt)}:{" "}
              {lastRun.Status === "running" ? <b>running now…</b> : `${lastRun.Status}, ${lastRun.JobsNew} new postings`}
              {nextDue && lastRun.Status !== "running" && <> · next due {formatDateTime(nextDue)}</>}
            </>
          ) : (
            "No fetch has run yet."
          )}
        </span>
        <Link href="/settings/runs" className="font-medium text-brand-600 hover:underline">
          Fetch runs &amp; automation →
        </Link>
      </div>

      <nav className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <Link
            key={t.tab}
            href={`/jobs/discover?tab=${t.tab}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              tab === t.tab ? "border-brand-600 font-medium text-brand-600" : "border-transparent text-gray-600 hover:text-gray-900"
            }`}
          >
            {t.label} <span className="text-gray-400">({counts[t.tab]})</span>
          </Link>
        ))}
      </nav>

      {tab === "filtered" && stages.length > 0 && (
        <div className="flex flex-wrap gap-1.5 text-sm">
          <Link
            href="/jobs/discover?tab=filtered"
            className={`rounded-full px-3 py-1 ${!stage ? "bg-brand-600 text-white" : "bg-white text-gray-700 ring-1 ring-gray-300"}`}
          >
            All
          </Link>
          {stages.map((s) => (
            <Link
              key={s.FilterStage}
              href={`/jobs/discover?tab=filtered&stage=${s.FilterStage}`}
              className={`rounded-full px-3 py-1 ${stage === s.FilterStage ? "bg-brand-600 text-white" : "bg-white text-gray-700 ring-1 ring-gray-300"}`}
            >
              {STAGE_LABELS[s.FilterStage] ?? s.FilterStage} ({s.N})
            </Link>
          ))}
        </div>
      )}

      {jobs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-600">
          {tab === "new" ? "No jobs waiting for review." : "Nothing here."}
        </p>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <JobCard key={job.Id} job={job} />
          ))}
        </ul>
      )}
    </div>
  );
}
