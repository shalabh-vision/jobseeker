import type { Metadata } from "next";
import { connection } from "next/server";
import { deleteBlockAction, addBlockAction } from "@/app/jobs/actions";
import { HowItWorks } from "@/components/how-it-works";
import { getScheduleStatus, type ScheduleStatus } from "@/lib/automation";
import { getNextDueAt, listFetchRuns, type FetchRun } from "@/lib/fetch-run";
import { formatDateTime } from "@/lib/format";
import { listBlockRules } from "@/lib/jobs";
import { getAllSettings } from "@/lib/settings";
import { AutoRefresh, RunNowButton, ScheduleControls, SettingsForm } from "./controls";

export const metadata: Metadata = { title: "Fetch runs & automation" };

const STATUS_TONE: Record<FetchRun["Status"], string> = {
  running: "bg-sky-100 text-sky-800",
  succeeded: "bg-green-100 text-green-800",
  partial: "bg-amber-100 text-amber-800",
  failed: "bg-red-100 text-red-800",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-brand-200/70 bg-white shadow-sm p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

async function safeScheduleStatus(): Promise<ScheduleStatus | { error: string }> {
  try {
    return await getScheduleStatus();
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export default async function RunsPage() {
  await connection();
  const [runs, schedule, nextDue, settings, blocks] = await Promise.all([
    listFetchRuns(),
    safeScheduleStatus(),
    getNextDueAt(),
    getAllSettings(),
    listBlockRules(),
  ]);
  const running = runs.some((r) => r.Status === "running");
  const remaining = runs.find((r) => r.ApiRequestsRemaining !== null)?.ApiRequestsRemaining ?? null;

  return (
    <div className="space-y-6">
      <AutoRefresh active={running} />
      <div>
        <h1 className="text-2xl font-semibold">Fetch runs &amp; automation</h1>
        <p className="text-gray-600">Where the automatic job search is set up, and a record of everything it did.</p>
      </div>

      <HowItWorks>
        <p>
          <b>Automatic fetch</b> is a Windows Task Scheduler task (<i>Task Scheduler → SahiNaukri → FetchJobs</i>). It
          starts every day at the chosen time, but only searches when {settings["fetch.intervalDays"]} days have passed
          since the last successful fetch, so a day your PC was off is caught up the next morning. The website does not
          need to be open.
        </p>
        <ul>
          <li>Each fetch refines your queries if your saved searches changed, searches the job feed, filters, then scores with Gemini.</li>
          <li><b>Run now</b> does the same immediately, whatever the schedule.</li>
          <li>Every run is listed below with its full log. The same log is written to <code>logs\fetch.log</code> in the project folder.</li>
          <li>From a terminal: <code>npm run fetch</code>, <code>npm run schedule:status</code>, <code>npm run schedule:remove</code>.</li>
        </ul>
      </HowItWorks>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="Automatic fetch">
          {"error" in schedule ? (
            <p className="text-sm text-red-700">Could not read Task Scheduler: {schedule.error}</p>
          ) : schedule.installed ? (
            <div className="mb-4 space-y-1 text-sm">
              <p>
                <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">On</span> Task
                state: {schedule.state}, checks daily at {schedule.time}
              </p>
              <p>Next check: {formatDateTime(schedule.nextRunAt)}</p>
              <p>
                Last check: {formatDateTime(schedule.lastRunAt)}
                {schedule.lastResult !== null && (schedule.lastResult === 0 ? " (ok)" : ` (exit code ${schedule.lastResult}; see the log)`)}
              </p>
              <p>Next search due: {nextDue ? formatDateTime(nextDue) : "at the next check"}</p>
            </div>
          ) : (
            <p className="mb-4 text-sm">
              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700">Off</span> Jobs are
              only fetched when you press Run now.
            </p>
          )}
          <ScheduleControls
            installed={!("error" in schedule) && schedule.installed}
            time={!("error" in schedule) && schedule.installed ? schedule.time : (settings["fetch.scheduleTime"] ?? "09:30")}
          />
          <div className="mt-4 border-t border-gray-100 pt-4">
            <RunNowButton running={running} />
            {remaining !== null && <p className="mt-2 text-xs text-gray-500">JSearch requests left this month: {remaining}</p>}
          </div>
        </Card>

        <Card title="Settings">
          <SettingsForm settings={settings} />
        </Card>
      </div>

      <Card title="Blocked employers and title words">
        <p className="mb-3 text-sm text-gray-600">
          Postings matching these are filtered out on every fetch. Employers are added when you tick &ldquo;Never show
          again&rdquo; while rejecting. Title words from your resume analysis (e.g. junior, intern) apply automatically.
        </p>
        {blocks.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-2">
            {blocks.map((b) => (
              <li key={b.Id} className="flex items-center gap-1 rounded-full bg-gray-100 py-0.5 pl-3 pr-1 text-sm">
                <span className="text-xs text-gray-500">{b.Kind}:</span> {b.Value}
                <form action={deleteBlockAction}>
                  <input type="hidden" name="id" value={b.Id} />
                  <button className="rounded-full px-1.5 text-gray-500 hover:bg-gray-200" title="Remove">
                    ×
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addBlockAction} className="flex flex-wrap gap-2">
          <select name="kind" className="rounded-md border border-gray-300 px-2 py-1 text-sm">
            <option value="employer">Employer</option>
            <option value="keyword">Title word</option>
          </select>
          <input name="value" required placeholder="e.g. Some Consultancy Pvt Ltd" className="rounded-md border border-gray-300 px-2 py-1 text-sm" />
          <button className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50">Block</button>
        </form>
      </Card>

      <Card title="Run history">
        {runs.length === 0 ? (
          <p className="text-sm text-gray-600">No runs yet.</p>
        ) : (
          <ul className="space-y-2">
            {runs.map((r) => (
              <li key={r.Id} className="rounded-md border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[r.Status]}`}>{r.Status}</span>
                  <span className="font-medium">#{r.Id}</span>
                  <span className="text-gray-600">
                    {formatDateTime(r.StartedAt)} · {r.Trigger}{r.CitiesOnly && <> · vacancies in {r.CitiesOnly} only</>}
                    {r.Refined && " · queries refined"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-700">
                  {r.QueriesRun} queries, {r.ApiRequestsUsed} requests · {r.JobsReturned} postings returned · {r.JobsNew} new ·{" "}
                  {r.JobsDuplicate} duplicates · {r.JobsFiltered} filtered · {r.JobsScored} scored
                </p>
                {r.ErrorText && <p className="mt-1 whitespace-pre-wrap text-sm text-red-700">{r.ErrorText}</p>}
                {r.LogText && (
                  <details className="mt-1" open={r.Status === "running"}>
                    <summary className="cursor-pointer text-xs text-brand-600">Log</summary>
                    <pre className="mt-1 max-h-80 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs text-gray-700">{r.LogText}</pre>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
