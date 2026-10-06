import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { HowItWorks } from "@/components/how-it-works";
import { FOLLOW_UP_AFTER_DAYS, listApplications, STATUS_LABELS, type ApplicationStatus, type ApplicationSummary } from "@/lib/applications";
import { formatDate, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Applications" };

const COLUMNS: ApplicationStatus[] = ["applied", "screening", "interview", "offer"];
const COLUMN_TONE: Record<string, string> = {
  applied: "border-t-gray-400",
  screening: "border-t-sky-500",
  interview: "border-t-brand-600",
  offer: "border-t-green-600",
};

const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

function AppCard({ app }: { app: ApplicationSummary }) {
  const quiet = daysSince(app.LastEventOn);
  const needsFollowUp = (app.Status === "applied" || app.Status === "screening") && quiet >= FOLLOW_UP_AFTER_DAYS;
  return (
    <li>
      <Link href={`/applications/${app.Id}`} className="block rounded-md border border-gray-200 bg-white p-3 hover:border-brand-300">
        <p className="text-sm font-medium">{app.Title}</p>
        <p className="text-xs text-gray-600">
          {app.EmployerName} · {app.IsRemote ? "Remote" : (app.City ?? "")}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Applied {formatDate(app.AppliedOn)} ({daysSince(app.AppliedOn)} days ago) via {app.Method}
        </p>
        {app.NextInterviewAt && (
          <p className="mt-1 rounded bg-brand-50 px-2 py-1 text-xs font-medium text-brand-800">
            {app.NextInterviewRound}: {formatDateTime(app.NextInterviewAt)}
          </p>
        )}
        {needsFollowUp && (
          <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">No news for {quiet} days: consider a follow-up</p>
        )}
      </Link>
    </li>
  );
}

export default async function ApplicationsPage() {
  await connection();
  const apps = await listApplications();
  const closed = apps.filter((a) => a.Status === "rejected" || a.Status === "withdrawn");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Applications</h1>
        <p className="text-gray-600">Every job you applied to, by stage.</p>
      </div>

      <HowItWorks>
        <p>
          An application appears here when you press <b>Mark as applied</b> on a job&apos;s Apply page. Open one to record
          what happens: recruiter calls, screening, follow-ups, interviews, offers or rejections.
        </p>
        <ul>
          <li>Recording an event moves the application along: a screening call moves it to Screening, a scheduled interview to Interviewing, and so on.</li>
          <li>Job portals do not report status back to other apps, so updates are recorded here by you, usually after an email or call.</li>
          <li>
            Cards with no news for {FOLLOW_UP_AFTER_DAYS} days are marked; a polite follow-up to the recruiter often helps.
          </li>
        </ul>
      </HowItWorks>

      {apps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-600">
          No applications yet. Apply to a saved job and press Mark as applied.
        </p>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            {COLUMNS.map((status) => {
              const items = apps.filter((a) => a.Status === status);
              return (
                <section key={status} className={`rounded-lg border border-t-4 border-gray-200 bg-gray-50 p-3 ${COLUMN_TONE[status]}`}>
                  <h2 className="mb-2 text-sm font-semibold">
                    {STATUS_LABELS[status]} <span className="font-normal text-gray-500">({items.length})</span>
                  </h2>
                  <ul className="space-y-2">
                    {items.map((a) => (
                      <AppCard key={a.Id} app={a} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
          {closed.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Closed ({closed.length})</h2>
              <ul className="grid gap-2 md:grid-cols-3">
                {closed.map((a) => (
                  <li key={a.Id}>
                    <Link href={`/applications/${a.Id}`} className="block rounded-md border border-gray-200 bg-white p-3 text-sm opacity-75 hover:opacity-100">
                      <span className="font-medium">{a.Title}</span> · {a.EmployerName}
                      <span className="block text-xs text-gray-500">
                        {STATUS_LABELS[a.Status]} · applied {formatDate(a.AppliedOn)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
