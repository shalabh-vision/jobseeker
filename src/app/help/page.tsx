import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "How it works" };

function Step({ n, title, href, children }: { n: number; title: string; href?: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-4 rounded-xl border border-slate-200/80 bg-white shadow-sm p-5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">{n}</span>
      <div className="space-y-2 text-sm text-gray-700">
        <h2 className="text-base font-semibold text-gray-900">
          {href ? (
            <Link href={href} className="text-brand-600 hover:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        {children}
      </div>
    </li>
  );
}

export default function HelpPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">How Sahi Naukri works</h1>
        <p className="text-gray-600">What happens automatically, what you do, and where to look when something seems off.</p>
      </div>

      <section className="rounded-lg border border-brand-200 bg-brand-50 p-5 text-sm text-brand-950">
        <h2 className="mb-2 font-semibold">Your routine (a few minutes each week)</h2>
        <ol className="ml-5 list-decimal space-y-1">
          <li>Open <Link href="/jobs/discover" className="underline">Discover</Link>: the automatic fetch has already found and scored new jobs.</li>
          <li>Read the top-scored jobs; <b>Approve</b> the ones you want, <b>Reject</b> the rest with a reason.</li>
          <li>Glance at <b>Filtered out</b> occasionally to make sure the filters are not too strict.</li>
          <li>In <Link href="/jobs/saved" className="underline">Saved jobs</Link>, press <b>Apply →</b>, use the kit to apply, then <b>Mark as applied</b>.</li>
        </ol>
      </section>

      <ol className="space-y-3">
        <Step n={1} title="Profile" href="/profile">
          <p>
            Your resume (.docx) is stored in JobsDB and analysed by Gemini: the roles that suit you, your core skills, and
            words that mark a posting as not for you. Do this once, and again whenever you update your resume.
          </p>
        </Step>
        <Step n={2} title="Searches" href="/searches">
          <p>
            <b>Saved searches</b> are what you want: a role, keywords, cities, office or remote, and optional preferred
            industries. <b>Refined queries</b> are what is actually sent to the job feed: Gemini merges similar titles and
            picks locations so the searches fit your request budget. Editing saved searches costs nothing; the next fetch
            refines them automatically.
          </p>
        </Step>
        <Step n={3} title="Fetch (automatic)" href="/settings/runs">
          <p>
            A Windows scheduled task checks every morning and searches once a week. Each fetch: .NET vacancy queries for the Tricity (Vacancies tab) → refine queries
            if needed → search JSearch (Google for Jobs: LinkedIn, Naukri, Indeed, company sites and more) → apply rules →
            remove duplicates → score with Gemini. It runs in the background; the website does not need to be open.
          </p>
          <p>
            The job feed allows 200 requests a month; a fetch uses up to 18. The Fetch runs page shows every run, its log,
            and the requests left.
          </p>
        </Step>
        <Step n={4} title="Discover" href="/jobs/discover">
          <p>
            New jobs sorted by fit score (85+ excellent, 70–84 good, 55–69 possible), each with Gemini&apos;s reasons and
            any red flags. Filtered-out jobs are kept with the reason, so you can check the filters and restore mistakes.
          </p>
        </Step>
        <Step n={5} title="Saved jobs" href="/jobs/saved">
          <p>Approved jobs, stored with the full description, split into To apply and Applied.</p>
        </Step>
        <Step n={6} title="Apply">
          <p>
            Per job, Gemini writes an application kit from your resume only: cover letter (also as Word), a summary for
            form boxes, screening answers (using your notice period and CTC from the Profile page), a recruiter message,
            and the requirements your resume does not cover. Edit anything, copy it into the job site&apos;s form, then
            record the application. You submit on the job site yourself: portals need your login and do not allow
            automated applications.
          </p>
        </Step>
        <Step n={7} title="Applications" href="/applications">
          <p>
            A board of everything you applied to: Applied, Screening, Interviewing, Offer, and Closed. Open an application
            to record recruiter calls, follow-ups, interviews (date, time, link, interviewers), offers or rejections, and
            to keep recruiter contacts. Portals do not report status back, so you record updates here after an email or
            call. Interview preparation comes next.
          </p>
        </Step>
      </ol>

      <section className="rounded-xl border border-slate-200/80 bg-white shadow-sm p-5 text-sm text-gray-700">
        <h2 className="mb-2 text-base font-semibold text-gray-900">When something looks wrong</h2>
        <ul className="ml-5 list-disc space-y-1">
          <li><b>No new jobs</b>: open Fetch runs. A red &ldquo;failed&rdquo; run shows the error; common causes are an expired API key or the monthly request limit.</li>
          <li><b>Automatic fetch did not run</b>: Fetch runs shows the task&apos;s next and last check. The PC must be on and you logged in; a missed day runs at the next check.</li>
          <li><b>Too many irrelevant jobs</b>: reject them with a reason, raise the minimum fit score in Settings, or edit your saved searches.</li>
          <li><b>Too few jobs</b>: check Filtered out for good jobs that were wrongly removed; lower the minimum fit score or add saved searches.</li>
          <li><b>Gemini errors</b>: the busy main model automatically falls back to a lighter one; unscored jobs are retried on the next fetch.</li>
        </ul>
      </section>
    </div>
  );
}
