import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EVENT_KINDS, getApplicationDetail, STATUS_LABELS, STATUSES, type Interview } from "@/lib/applications";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  deleteContactAction,
  deleteEventAction,
  deleteInterviewAction,
  interviewOutcomeAction,
  setStatusAction,
} from "../actions";
import { AddContactForm, AddEventForm, ScheduleInterviewForm } from "../forms";

export const metadata: Metadata = { title: "Application" };

const small = "rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs hover:bg-gray-50";

const OUTCOME_LABEL: Record<Interview["Outcome"], string> = {
  pending: "Upcoming",
  awaiting: "Done, awaiting result",
  passed: "Cleared",
  failed: "Not cleared",
  cancelled: "Cancelled",
};
const OUTCOME_TONE: Record<Interview["Outcome"], string> = {
  pending: "bg-brand-100 text-brand-800",
  awaiting: "bg-amber-100 text-amber-800",
  passed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-200 text-gray-700",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

// Event kinds the user can add by hand (applied/status/interview_scheduled are recorded by other actions).
const ADDABLE = ["note", "recruiter_contact", "screening", "follow_up", "interview_done", "offer", "rejected", "withdrawn"] as const;

export default async function ApplicationPage({ params }: PageProps<"/applications/[id]">) {
  await connection();
  const id = Number((await params).id);
  const app = Number.isInteger(id) ? await getApplicationDetail(id) : null;
  if (!app) notFound();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <div className="space-y-5">
      <Link href="/applications" className="text-sm text-brand-600 hover:underline">
        ← Applications
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-slate-200/80 bg-white shadow-sm p-5">
        <div>
          <h1 className="text-xl font-semibold">{app.Title}</h1>
          <p className="text-gray-700">
            {app.EmployerName} · {app.IsRemote ? "Remote" : (app.City ?? "")}
          </p>
          <p className="text-sm text-gray-600">
            Applied {formatDate(app.AppliedOn)} via {app.Method}
            {app.AppliedUrl && (
              <>
                {" "}
                ·{" "}
                <a href={app.AppliedUrl} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  where you applied ↗
                </a>
              </>
            )}
          </p>
          <p className="mt-1 flex gap-3 text-sm">
            <Link href={`/jobs/${app.JobPostingId}`} className="text-brand-600 hover:underline">
              Job description
            </Link>
            <Link href={`/jobs/${app.JobPostingId}/apply`} className="text-brand-600 hover:underline">
              Application kit (what you sent)
            </Link>
          </p>
        </div>
        <form action={setStatusAction} className="flex items-center gap-2">
          <input type="hidden" name="applicationId" value={app.Id} />
          <label className="text-sm text-gray-600" htmlFor="status">
            Status
          </label>
          <select id="status" name="status" defaultValue={app.Status} className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50">Set</button>
        </form>
      </div>

      <Card title="Add an update">
        <AddEventForm
          applicationId={app.Id}
          today={today}
          kinds={ADDABLE.map((k) => ({ value: k, label: EVENT_KINDS[k].label }))}
        />
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Timeline">
          <ol className="space-y-3 border-l-2 border-gray-200 pl-4">
            {app.events.map((e) => (
              <li key={e.Id} className="relative">
                <span className="absolute -left-[1.4rem] top-1.5 h-2.5 w-2.5 rounded-full bg-brand-500" />
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {EVENT_KINDS[e.Kind]?.label ?? e.Kind} <span className="font-normal text-gray-500">· {formatDate(e.EventOn)}</span>
                    </p>
                    {e.Note && <p className="text-sm text-gray-700">{e.Note}</p>}
                  </div>
                  {e.Kind !== "applied" && (
                    <form action={deleteEventAction}>
                      <input type="hidden" name="applicationId" value={app.Id} />
                      <input type="hidden" name="eventId" value={e.Id} />
                      <button className="text-xs text-gray-400 hover:text-red-700" title="Delete this update">
                        ×
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card title="Contacts">
          {app.contacts.length > 0 && (
            <ul className="mb-4 space-y-2">
              {app.contacts.map((c) => (
                <li key={c.Id} className="flex items-start justify-between gap-2 rounded-md border border-gray-200 p-2 text-sm">
                  <div>
                    <p className="font-medium">
                      {c.Name}
                      {c.Role && <span className="font-normal text-gray-500"> · {c.Role}</span>}
                    </p>
                    <p className="text-gray-700">
                      {c.Email && (
                        <a href={`mailto:${c.Email}`} className="text-brand-600 hover:underline">
                          {c.Email}
                        </a>
                      )}
                      {c.Email && c.Phone && " · "}
                      {c.Phone && <a href={`tel:${c.Phone}`}>{c.Phone}</a>}
                    </p>
                    {c.Notes && <p className="text-gray-600">{c.Notes}</p>}
                  </div>
                  <form action={deleteContactAction}>
                    <input type="hidden" name="applicationId" value={app.Id} />
                    <input type="hidden" name="contactId" value={c.Id} />
                    <button className="text-xs text-gray-400 hover:text-red-700" title="Remove contact">
                      ×
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <AddContactForm applicationId={app.Id} />
        </Card>
      </div>

      <Card title="Interviews">
        {app.interviews.length > 0 && (
          <ul className="mb-4 space-y-2">
            {app.interviews.map((iv) => (
              <li key={iv.Id} className="rounded-md border border-gray-200 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {iv.Round} · {formatDateTime(iv.ScheduledAt)}{" "}
                      <span className={`ml-1 rounded-full px-2 py-0.5 text-xs ${OUTCOME_TONE[iv.Outcome]}`}>{OUTCOME_LABEL[iv.Outcome]}</span>
                    </p>
                    <p className="text-gray-700">
                      {iv.Mode}
                      {iv.Location && (
                        <>
                          {" · "}
                          {/^https?:\/\//.test(iv.Location) ? (
                            <a href={iv.Location} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                              join link ↗
                            </a>
                          ) : (
                            iv.Location
                          )}
                        </>
                      )}
                      {iv.Interviewers && <> · with {iv.Interviewers}</>}
                    </p>
                    {iv.Notes && <p className="text-gray-600">{iv.Notes}</p>}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <form action={interviewOutcomeAction} className="flex gap-1.5">
                      <input type="hidden" name="applicationId" value={app.Id} />
                      <input type="hidden" name="interviewId" value={iv.Id} />
                      <select name="outcome" defaultValue={iv.Outcome} className="rounded-md border border-gray-300 px-1.5 py-0.5 text-xs">
                        {Object.entries(OUTCOME_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                      <button className={small}>Update</button>
                    </form>
                    <form action={deleteInterviewAction}>
                      <input type="hidden" name="applicationId" value={app.Id} />
                      <input type="hidden" name="interviewId" value={iv.Id} />
                      <button className={`${small} text-red-700`}>Delete</button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <details open={app.interviews.length === 0 && app.Status === "interview"}>
          <summary className="cursor-pointer text-sm font-medium text-brand-600">Schedule an interview</summary>
          <div className="mt-3">
            <ScheduleInterviewForm applicationId={app.Id} />
          </div>
        </details>
        <p className="mt-3 text-xs text-gray-500">Interview preparation (likely questions, company profile) is the next page we will build.</p>
      </Card>
    </div>
  );
}
