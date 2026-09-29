import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { CopyButton } from "@/components/copy-button";
import { HowItWorks } from "@/components/how-it-works";
import { JobDecisionButtons, ScoreBadge } from "@/components/job-card";
import { getApplicantDetails } from "@/lib/applicant";
import { getApplication, getKit } from "@/lib/apply";
import { formatDate, formatDateTime } from "@/lib/format";
import { getJob } from "@/lib/jobs";
import { getProfile } from "@/lib/profile";
import { undoAppliedAction } from "./actions";
import { AskQuestionForm, GenerateKitButton, KitEditForm, MarkAppliedForm } from "./forms";

export const metadata: Metadata = { title: "Apply" };

const textarea = "w-full rounded-md border border-gray-300 px-3 py-2 text-sm leading-relaxed";

function Card({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        {actions && <div className="flex gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export default async function ApplyPage({ params }: PageProps<"/jobs/[id]/apply">) {
  await connection();
  const id = Number((await params).id);
  const job = Number.isInteger(id) ? await getJob(id) : null;
  if (!job) notFound();
  const [kit, application, details, profile] = await Promise.all([getKit(id), getApplication(id), getApplicantDetails(), getProfile()]);

  const applyOptions = job.ApplyOptionsJson
    ? (JSON.parse(job.ApplyOptionsJson) as { apply_link: string; is_direct: boolean; publisher: string }[])
    : job.ApplyLink
      ? [{ apply_link: job.ApplyLink, is_direct: !!job.ApplyIsDirect, publisher: job.Publisher ?? "Apply link" }]
      : [];
  // Prefer the employer's own site: fewer middlemen, and the application goes straight to them.
  applyOptions.sort((a, b) => Number(b.is_direct) - Number(a.is_direct));

  const missing = [
    ["name", details.FullName],
    ["email", details.Email],
    ["phone", details.Phone],
    ["notice period", details.NoticePeriod],
    ["current CTC", details.CurrentCtcLpa],
    ["expected CTC", details.ExpectedCtcLpa],
  ]
    .filter(([, v]) => v === null || v === "")
    .map(([label]) => label);
  const resumeHasPersonalData = !!profile && /\b(DOB|date of birth)\b/i.test(profile.ResumeText);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  return (
    <div className="space-y-5">
      <Link href="/jobs/saved" className="text-sm text-indigo-700 hover:underline">
        ← Saved jobs
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex gap-4">
          <ScoreBadge score={job.FitScore} />
          <div>
            <h1 className="text-xl font-semibold">Apply: {job.Title}</h1>
            <p className="text-gray-700">
              {job.EmployerName} · {job.IsRemote ? "Remote" : (job.City ?? "location unclear")} · posted {formatDate(job.PostedAt)}
            </p>
            <Link href={`/jobs/${job.Id}`} className="text-sm text-indigo-700 hover:underline">
              Full job description and fit analysis
            </Link>
          </div>
        </div>
        {job.Status !== "approved" && <JobDecisionButtons job={job} />}
      </div>

      {application && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-900">
          <span>
            <b>Applied on {formatDate(application.AppliedOn)}</b> via {application.Method}
            {application.Notes && <> · {application.Notes}</>} ·{" "}
            <Link href={`/applications/${application.Id}`} className="underline">
              track this application
            </Link>
          </span>
          <form action={undoAppliedAction}>
            <input type="hidden" name="jobId" value={job.Id} />
            <button className="rounded-md border border-green-300 bg-white px-2.5 py-1 text-xs">Undo</button>
          </form>
        </div>
      )}

      <HowItWorks open={!kit}>
        <ol className="ml-5 list-decimal space-y-1">
          <li>
            <b>Write application kit</b>: Gemini tailors a cover letter, summary, screening answers and recruiter message
            to this job using only facts from your resume. <b>Read it through</b> and edit anything that is not quite you.
          </li>
          <li>Open an apply link below (the employer&apos;s own site is listed first) and fill the form, copying from the kit.</li>
          <li>Form has a question not covered? Paste it into &ldquo;Answer a form question&rdquo;.</li>
          <li>
            Come back and press <b>Mark as applied</b>, so the job moves to your applications and its status can be
            tracked.
          </li>
        </ol>
        <p>
          Job boards blocked by the office firewall? Open the link on your phone or at home; the kit and downloads are
          here whenever you need them.
        </p>
      </HowItWorks>

      <Card
        title="1 · Before you apply"
        actions={
          <a href="/api/resume" className="rounded-md border border-gray-300 bg-white px-3 py-1 text-xs font-medium hover:bg-gray-50">
            Download resume
          </a>
        }
      >
        <ul className="space-y-1 text-sm text-gray-700">
          {missing.length > 0 ? (
            <li className="text-amber-800">
              Your application details are missing: {missing.join(", ")}. They appear as [placeholders] in the kit.{" "}
              <Link href="/profile" className="underline">
                Add them on the Profile page
              </Link>
              , then rewrite the kit.
            </li>
          ) : (
            <li>Your application details are complete.</li>
          )}
          {resumeHasPersonalData && (
            <li className="text-gray-600">
              Tip: your resume includes your date of birth and home address. Many candidates leave these out when applying.
            </li>
          )}
        </ul>
      </Card>

      <Card title="2 · Application kit" actions={<GenerateKitButton jobId={job.Id} hasKit={!!kit} />}>
        {!kit ? (
          <p className="text-sm text-gray-600">No kit yet for this job.</p>
        ) : (
          <div className="space-y-6">
            <p className="text-xs text-gray-500">
              Written {formatDateTime(kit.generatedAt)} by {kit.model}
              {kit.editedAt && <> · edited {formatDateTime(kit.editedAt)}</>}
            </p>

            {kit.keyPoints.length > 0 && (
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-medium">Why you fit</h3>
                  <CopyButton text={kit.keyPoints.map((p) => `• ${p}`).join("\n")} />
                </div>
                <ul className="ml-5 list-disc text-sm text-gray-700">
                  {kit.keyPoints.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            )}

            {kit.keywordGaps.length > 0 && (
              <div className="rounded-md bg-amber-50 p-3">
                <h3 className="mb-1 text-sm font-medium text-amber-900">Asked for, but not in your resume</h3>
                <ul className="space-y-1 text-sm text-amber-900">
                  {kit.keywordGaps.map((g) => (
                    <li key={g.keyword}>
                      <b>{g.keyword}</b>: {g.suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Keyed on the save time so the fields reset after a rewrite or save. */}
            <KitEditForm key={`${kit.generatedAt.getTime()}-${kit.editedAt?.getTime() ?? 0}`} jobId={job.Id}>
              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-medium">Cover letter</h3>
                  <CopyButton targetId="coverLetter" />
                  <a href={`/jobs/${job.Id}/apply/cover-letter`} className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-gray-50">
                    Download .docx
                  </a>
                </div>
                <textarea id="coverLetter" name="coverLetter" rows={16} defaultValue={kit.coverLetter} className={textarea} />
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-medium">Profile summary (for the &ldquo;summary&rdquo; box on forms)</h3>
                  <CopyButton targetId="resumeSummary" />
                </div>
                <textarea id="resumeSummary" name="resumeSummary" rows={4} defaultValue={kit.resumeSummary} className={textarea} />
              </div>

              <div>
                <h3 className="mb-1 text-sm font-medium">Screening answers</h3>
                <p className="mb-2 text-xs text-gray-500">Clear a question to remove it.</p>
                <div className="space-y-3">
                  {kit.screeningAnswers.map((qa, i) => (
                    <div key={i} className="rounded-md border border-gray-200 p-3">
                      <input name="question" defaultValue={qa.question} className="mb-1 w-full border-0 p-0 text-sm font-medium focus:ring-0" />
                      <textarea id={`answer-${i}`} name="answer" rows={3} defaultValue={qa.answer} className={textarea} />
                      <div className="mt-1">
                        <CopyButton targetId={`answer-${i}`} label="Copy answer" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-medium">Message to the recruiter (email or LinkedIn)</h3>
                  <CopyButton targetId="recruiterMessage" />
                </div>
                <input id="recruiterSubject" name="recruiterSubject" defaultValue={kit.recruiterSubject} className={`${textarea} mb-2`} />
                <textarea id="recruiterMessage" name="recruiterMessage" rows={9} defaultValue={kit.recruiterMessage} className={textarea} />
              </div>
            </KitEditForm>

            <div className="rounded-md border border-dashed border-gray-300 p-3">
              <h3 className="mb-2 text-sm font-medium">Answer a form question</h3>
              <AskQuestionForm jobId={job.Id} />
            </div>
          </div>
        )}
      </Card>

      <Card title="3 · Apply and record it">
        {applyOptions.length > 0 ? (
          <ul className="mb-4 space-y-1 text-sm">
            {applyOptions.map((o) => (
              <li key={o.apply_link} className="flex flex-wrap items-center gap-2">
                <a href={o.apply_link} target="_blank" rel="noreferrer" className="font-medium text-indigo-700 hover:underline">
                  Apply on {o.publisher} ↗
                </a>
                {o.is_direct && <span className="rounded bg-green-100 px-1.5 text-xs text-green-800">employer&apos;s own site</span>}
                <CopyButton text={o.apply_link} label="Copy link" />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm text-gray-600">No apply link was provided with this posting; search for it on the employer&apos;s careers page.</p>
        )}
        {application ? (
          <p className="text-sm text-gray-700">
            Recorded as applied.{" "}
            <Link href={`/applications/${application.Id}`} className="text-indigo-700 hover:underline">
              Track its status on the Applications page
            </Link>
            .
          </p>
        ) : (
          <MarkAppliedForm jobId={job.Id} defaultUrl={applyOptions[0]?.apply_link ?? ""} today={today} />
        )}
      </Card>
    </div>
  );
}
