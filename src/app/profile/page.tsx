import type { Metadata } from "next";
import { connection } from "next/server";
import { getApplicantDetails } from "@/lib/applicant";
import { formatDateTime } from "@/lib/format";
import { getProfile, type ProfileAnalysis } from "@/lib/profile";
import { DetailsForm } from "./details-form";
import { ResumeActions } from "./resume-actions";

export const metadata: Metadata = { title: "Profile" };

const fitStyles: Record<ProfileAnalysis["suitableRoles"][number]["fit"], string> = {
  strong: "bg-green-100 text-green-800",
  good: "bg-blue-100 text-blue-800",
  stretch: "bg-amber-100 text-amber-800",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-brand-200/70 bg-white shadow-sm p-5">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

function Chips({ items, tone = "bg-gray-100 text-gray-800" }: { items: string[]; tone?: string }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className={`rounded-full px-2.5 py-0.5 text-sm ${tone}`}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default async function ProfilePage() {
  await connection();
  const [profile, details] = await Promise.all([getProfile(), getApplicantDetails()]);
  const a = profile?.analysis;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Profile</h1>
        <p className="text-gray-600">
          Your resume is analysed by Gemini to decide which roles to search for and which postings to ignore.
        </p>
      </div>

      <Card title="Resume">
        {profile ? (
          <p className="mb-4 text-sm text-gray-700">
            <a href="/api/resume" className="font-medium text-brand-600 hover:underline">
              {profile.ResumeFileName}
            </a>{" "}
            · uploaded {formatDateTime(profile.UploadedAt)}
            {profile.AnalyzedAt && (
              <>
                {" "}
                · analysed {formatDateTime(profile.AnalyzedAt)} with {profile.AnalysisModel}
              </>
            )}
          </p>
        ) : (
          <p className="mb-4 text-sm text-gray-700">No resume stored yet.</p>
        )}
        <ResumeActions hasResume={!!profile} />
      </Card>

      <Card title="Your details for applications">
        <p className="mb-3 text-sm text-gray-600">
          Used to fill screening answers and the cover letter header. Anything left blank appears as a [placeholder] you can
          fill in per application.
        </p>
        <DetailsForm details={details} />
      </Card>

      {a && (
        <>
          <section className="rounded-xl border border-brand-200/70 bg-white shadow-sm p-5">
            <h2 className="text-xl font-semibold">{a.candidateName}</h2>
            <p className="text-gray-700">{a.headline}</p>
            <p className="mt-2 text-sm text-gray-600">
              {a.totalYearsExperience} years in software/IT · seniority: {a.seniorityLevel} · postings asking for fewer
              than {a.minimumRoleExperienceYears} years are treated as too junior
            </p>
          </section>

          <Card title="Roles that suit you">
            <ul className="grid gap-3 md:grid-cols-2">
              {a.suitableRoles.map((role) => (
                <li key={role.title} className="rounded-md border border-gray-200 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{role.title}</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${fitStyles[role.fit]}`}>{role.fit}</span>
                  </div>
                  <p className="mt-1 text-sm text-gray-600">{role.rationale}</p>
                  <p className="mt-2 text-xs text-gray-500">Search terms: {role.searchKeywords.join(", ")}</p>
                </li>
              ))}
            </ul>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="Core skills">
              <Chips items={a.coreSkills} tone="bg-brand-50 text-brand-800" />
            </Card>
            <Card title="Secondary skills">
              <Chips items={a.secondarySkills} />
            </Card>
            <Card title="Domains">
              <Chips items={a.domains} />
            </Card>
            <Card title="Postings with these title words are ignored">
              <Chips items={a.excludeKeywords} tone="bg-red-50 text-red-800" />
            </Card>
            <Card title="Strengths">
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                {a.strengths.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </Card>
            <Card title="Gaps employers may probe">
              <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
                {a.gapsToAddress.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}

      {profile && (
        <details className="rounded-xl border border-brand-200/70 bg-white shadow-sm p-5">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">Text extracted from your resume</summary>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-gray-700">{profile.ResumeText}</pre>
        </details>
      )}
    </div>
  );
}
