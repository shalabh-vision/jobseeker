import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JobDecisionButtons, ScoreBadge } from "@/components/job-card";
import { formatDate, formatDateTime } from "@/lib/format";
import { getJob, parseList } from "@/lib/jobs";

export async function generateMetadata({ params }: PageProps<"/jobs/[id]">): Promise<Metadata> {
  await connection();
  const job = await getJob(Number((await params).id));
  return { title: job ? `${job.Title} – ${job.EmployerName}` : "Job" };
}

const STATUS_LABEL = { new: "Waiting for review", approved: "Approved and saved", filtered: "Filtered out", rejected: "Rejected" };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

export default async function JobPage({ params }: PageProps<"/jobs/[id]">) {
  await connection();
  const id = Number((await params).id);
  const job = Number.isInteger(id) ? await getJob(id) : null;
  if (!job) notFound();

  const reasons = job.FitReasonsJson ? (JSON.parse(job.FitReasonsJson) as { matches: string[]; concerns: string[] }) : null;
  const redFlags = parseList(job.RedFlagsJson);
  const applyOptions = job.ApplyOptionsJson
    ? (JSON.parse(job.ApplyOptionsJson) as { apply_link: string; is_direct: boolean; publisher: string }[])
    : [];
  const highlights = job.HighlightsJson ? (JSON.parse(job.HighlightsJson) as Record<string, string[]>) : {};
  const back = job.Status === "approved" ? "/jobs/saved" : `/jobs/discover?tab=${job.Status}`;

  return (
    <div className="space-y-5">
      <Link href={back} className="text-sm text-indigo-700 hover:underline">
        ← Back
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex gap-4">
          <ScoreBadge score={job.FitScore} />
          <div>
            <h1 className="text-xl font-semibold">{job.Title}</h1>
            <p className="text-gray-700">
              {job.EmployerWebsite ? (
                <a href={job.EmployerWebsite} target="_blank" rel="noreferrer" className="hover:underline">
                  {job.EmployerName}
                </a>
              ) : (
                job.EmployerName
              )}{" "}
              · {job.IsRemote ? "Remote" : (job.City ?? "location unclear")}
              {job.EmploymentType && <> · {job.EmploymentType}</>}
            </p>
            <p className="text-sm text-gray-600">
              {STATUS_LABEL[job.Status]}
              {job.DecidedAt && <> on {formatDateTime(job.DecidedAt)}</>} · posted {formatDate(job.PostedAt)} · first found{" "}
              {formatDateTime(job.FirstSeenAt)}
              {job.SalaryText && <> · {job.SalaryText}</>}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <JobDecisionButtons job={job} />
          {job.Status === "approved" && (
            <Link href={`/jobs/${job.Id}/apply`} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              {job.AppliedOn ? "Application kit" : "Apply →"}
            </Link>
          )}
        </div>
      </div>

      {job.Status === "filtered" && job.FilterReason && (
        <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900">
          Filtered out: {job.FilterReason}
          {job.DuplicateOfId && (
            <>
              {" "}
              (<Link href={`/jobs/${job.DuplicateOfId}`} className="underline">see the original</Link>)
            </>
          )}
        </p>
      )}
      {job.RejectReason && job.Status === "rejected" && (
        <p className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-800">You rejected it: {job.RejectReason}</p>
      )}

      <div className="grid gap-5 md:grid-cols-2">
        <Section title="Fit for you">
          {job.FitSummary ? (
            <>
              <p className="text-sm text-gray-800">{job.FitSummary}</p>
              {reasons && reasons.matches.length > 0 && (
                <>
                  <h3 className="mt-3 text-sm font-medium text-green-800">You match</h3>
                  <ul className="ml-5 list-disc text-sm text-gray-700">{reasons.matches.map((m) => <li key={m}>{m}</li>)}</ul>
                </>
              )}
              {reasons && reasons.concerns.length > 0 && (
                <>
                  <h3 className="mt-3 text-sm font-medium text-amber-800">Gaps or concerns</h3>
                  <ul className="ml-5 list-disc text-sm text-gray-700">{reasons.concerns.map((c) => <li key={c}>{c}</li>)}</ul>
                </>
              )}
              <p className="mt-3 text-xs text-gray-500">
                {job.RequiredYears !== null && <>Asks for {job.RequiredYears}+ years · </>}
                {job.Industry && <>Industry: {job.Industry}{job.IndustryMatch && " (one of your preferred)"} · </>}
                Scored by {job.ScoreModel}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-600">Not scored (filtered by a rule before scoring, or scoring is pending).</p>
          )}
        </Section>

        <Section title="Apply / source">
          {redFlags.length > 0 && (
            <div className="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
              <b>Red flags</b>
              <ul className="ml-5 list-disc">{redFlags.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
          <ul className="space-y-1 text-sm">
            {applyOptions.length > 0
              ? applyOptions.map((o) => (
                  <li key={o.apply_link}>
                    <a href={o.apply_link} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
                      {o.publisher}
                    </a>
                    {o.is_direct && <span className="ml-1 text-xs text-green-700">(employer&apos;s own site)</span>}
                  </li>
                ))
              : job.ApplyLink && (
                  <li>
                    <a href={job.ApplyLink} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
                      {job.Publisher ?? "Apply link"}
                    </a>
                  </li>
                )}
            {job.GoogleLink && (
              <li>
                <a href={job.GoogleLink} target="_blank" rel="noreferrer" className="text-indigo-700 hover:underline">
                  View on Google Jobs
                </a>
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-gray-500">
            Some job boards may be blocked by your office firewall; the full description is saved below.
            {job.SearchQueryText && <> Found by: {job.SearchQueryText}.</>}
          </p>
        </Section>
      </div>

      {Object.keys(highlights).length > 0 && (
        <Section title="Highlights">
          <div className="grid gap-4 md:grid-cols-3">
            {Object.entries(highlights).map(([heading, items]) => (
              <div key={heading}>
                <h3 className="text-sm font-medium">{heading}</h3>
                <ul className="ml-5 list-disc text-sm text-gray-700">{items.map((i) => <li key={i}>{i}</li>)}</ul>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Full job description">
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{job.Description || "No description provided."}</div>
      </Section>
    </div>
  );
}
