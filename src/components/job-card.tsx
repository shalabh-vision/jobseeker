import Link from "next/link";
import { approveAction, rejectAction, restoreAction } from "@/app/jobs/actions";
import { formatDate } from "@/lib/format";
import { parseList, type JobListItem } from "@/lib/jobs";

const REJECT_REASONS = [
  "Too junior",
  "Wrong tech stack",
  "Not interested in this company",
  "Recruitment agency / consultancy",
  "Location or commute",
  "Looks fake or spam",
  "Other",
];

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-600">not scored</span>;
  const tone =
    score >= 85 ? "bg-green-600 text-white" : score >= 70 ? "bg-green-100 text-green-800" : score >= 55 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800";
  return <span className={`rounded-md px-2 py-1 text-sm font-semibold ${tone}`}>{score}</span>;
}

const button = "rounded-md px-3 py-1.5 text-sm font-medium";

export function JobDecisionButtons({ job }: { job: Pick<JobListItem, "Id" | "Status" | "EmployerName"> }) {
  return (
    <div className="flex flex-wrap items-start gap-2">
      {job.Status !== "approved" && (
        <form action={approveAction}>
          <input type="hidden" name="id" value={job.Id} />
          <button className={`${button} bg-green-600 text-white hover:bg-green-700`}>Approve &amp; save</button>
        </form>
      )}
      {job.Status !== "rejected" && (
        <details className="relative">
          <summary className={`${button} cursor-pointer list-none border border-gray-300 bg-white hover:bg-gray-50`}>Reject…</summary>
          <form action={rejectAction} className="absolute right-0 z-10 mt-1 w-72 space-y-2 rounded-md border border-gray-200 bg-white p-3 shadow-lg">
            <input type="hidden" name="id" value={job.Id} />
            <select name="reason" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm">
              {REJECT_REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <input name="note" placeholder="Note (optional)" className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="blockEmployer" /> Never show {job.EmployerName} again
            </label>
            <button className={`${button} w-full bg-red-600 text-white hover:bg-red-700`}>Reject</button>
          </form>
        </details>
      )}
      {job.Status !== "new" && (
        <form action={restoreAction}>
          <input type="hidden" name="id" value={job.Id} />
          <button className={`${button} border border-gray-300 bg-white hover:bg-gray-50`}>Move back to New</button>
        </form>
      )}
    </div>
  );
}

export function JobCard({ job }: { job: JobListItem }) {
  const redFlags = parseList(job.RedFlagsJson);
  return (
    <li className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex gap-4">
        <div className="pt-0.5">
          <ScoreBadge score={job.FitScore} />
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              {/* New tab keeps your place in the list while you read the full posting. */}
              <Link href={`/jobs/${job.Id}`} target="_blank" className="font-medium text-indigo-700 hover:underline">
                {job.Title} <span className="text-xs text-gray-400">↗</span>
              </Link>
              <p className="text-sm text-gray-700">
                {job.EmployerName} · {job.IsRemote ? "Remote" : (job.City ?? "location unclear")}
                {job.PostedAt && <> · posted {formatDate(job.PostedAt)}</>}
                {job.Publisher && <> · via {job.Publisher}</>}
              </p>
            </div>
            <JobDecisionButtons job={job} />
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            {job.RequiredYears !== null && <span className="rounded bg-gray-100 px-1.5 py-0.5">{job.RequiredYears}+ yrs asked</span>}
            {job.SalaryText && <span className="rounded bg-gray-100 px-1.5 py-0.5">{job.SalaryText}</span>}
            {job.Industry && (
              <span className={`rounded px-1.5 py-0.5 ${job.IndustryMatch ? "bg-purple-100 text-purple-800" : "bg-gray-100"}`}>
                {job.Industry}
                {job.IndustryMatch && " ★ preferred"}
              </span>
            )}
          </div>
          {job.FitSummary && <p className="text-sm text-gray-700">{job.FitSummary}</p>}
          {job.FilterReason && job.Status === "filtered" && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Filtered out:</span> {job.FilterReason}
            </p>
          )}
          {job.RejectReason && job.Status === "rejected" && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">You rejected it:</span> {job.RejectReason}
            </p>
          )}
          {redFlags.length > 0 && (
            <p className="text-sm text-red-700">
              <span className="font-medium">Red flags:</span> {redFlags.join("; ")}
            </p>
          )}
          {job.SearchQueryText && <p className="text-xs text-gray-500">Found by: {job.SearchQueryText}</p>}
          {job.Status === "approved" && (
            <p className="pt-1">
              {job.AppliedOn ? (
                <Link href={`/jobs/${job.Id}/apply`} className="rounded-md bg-green-100 px-2 py-1 text-sm text-green-800">
                  Applied on {formatDate(job.AppliedOn)} ({job.ApplicationStatus})
                </Link>
              ) : (
                <Link href={`/jobs/${job.Id}/apply`} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                  Apply →
                </Link>
              )}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
