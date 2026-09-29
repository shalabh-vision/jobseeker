import type { Metadata } from "next";
import { connection } from "next/server";
import { HowItWorks } from "@/components/how-it-works";
import { JobCard } from "@/components/job-card";
import { listJobs } from "@/lib/jobs";

export const metadata: Metadata = { title: "Saved jobs" };

export default async function SavedJobsPage() {
  await connection();
  const jobs = await listJobs("approved");
  const toApply = jobs.filter((j) => !j.AppliedOn);
  const applied = jobs.filter((j) => j.AppliedOn);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Saved jobs</h1>
        <p className="text-gray-600">Jobs you approved on Discover, stored in JobsDB with their full description.</p>
      </div>
      <HowItWorks>
        <p>
          Press <b>Apply →</b> on a job to get a tailored application kit (cover letter, form answers, recruiter message),
          the apply links, and a button to record that you applied.
        </p>
        <p>Jobs stay here even after the posting disappears from job boards. Changed your mind? Reject it or move it back to New.</p>
      </HowItWorks>
      {jobs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-600">
          No saved jobs yet. Approve jobs on the Discover page.
        </p>
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">To apply ({toApply.length})</h2>
            {toApply.length === 0 ? (
              <p className="text-sm text-gray-600">You have applied to every saved job.</p>
            ) : (
              <ul className="space-y-3">
                {toApply.map((job) => (
                  <JobCard key={job.Id} job={job} />
                ))}
              </ul>
            )}
          </section>
          {applied.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Applied ({applied.length})</h2>
              <ul className="space-y-3">
                {applied.map((job) => (
                  <JobCard key={job.Id} job={job} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
