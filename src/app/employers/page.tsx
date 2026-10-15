import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { HowItWorks } from "@/components/how-it-works";
import { listEmployers } from "@/lib/career/employers";

export const metadata: Metadata = { title: "Employers" };

const TYPE: Record<string, string> = {
  product: "Product company",
  startup: "Startup",
  mnc: "MNC",
  enterprise: "Large enterprise",
  "it-services": "IT services",
};

export default async function EmployersPage() {
  await connection();
  const employers = await listEmployers(30);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Employers</h1>
        <p className="text-gray-600">The best employers for your profile, with their strengths and weaknesses for you.</p>
      </div>

      <HowItWorks>
        <p>
          Built from the jobs Sahi Naukri has rated (fit, landing chance, job quality): each company&rsquo;s strengths are the
          highlights of its postings for you, its weaknesses are the downsides of those jobs and the bigger gaps you would
          have to close. Ranked like TOP 25 (landing chance first). These are not employee review ratings: Glassdoor,
          AmbitionBox and Blind are blocked from this network. Recruitment agencies are left out.
        </p>
      </HowItWorks>

      {employers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">
          No rated jobs yet. Rate jobs from Vacancies → TOP 25.
        </p>
      ) : (
        <ol className="grid gap-4 lg:grid-cols-2">
          {employers.map((e, i) => (
            <li key={e.name} className="space-y-3 rounded-xl border border-brand-200/70 bg-white p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 font-bold text-white">
                  {e.score}
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-gray-400">#{i + 1}</p>
                  <h2 className="text-lg font-semibold leading-tight">{e.name}</h2>
                  <p className="text-xs text-gray-500">
                    {[TYPE[e.employerType], e.facts?.Industries, e.facts?.Employees && `${e.facts.Employees.toLocaleString("en-IN")} employees`, ...e.workModes]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-green-700">Strengths for you</p>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {e.strengths.map((s) => (
                      <li key={s}>+ {s}</li>
                    ))}
                    {e.perks.length > 0 && <li className="text-gray-500">Perks stated: {e.perks.join(", ")}</li>}
                    {e.pay.length > 0 && <li className="text-gray-500">Pay stated: {e.pay.join("; ")}</li>}
                  </ul>
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-700">Weaknesses for you</p>
                  <ul className="space-y-1 text-sm text-gray-700">
                    {e.weaknesses.map((w) => (
                      <li key={w}>− {w}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <ul className="border-t border-gray-100 pt-2 text-xs text-gray-600">
                {e.postings.map((p) => (
                  <li key={p.id}>
                    <Link href={`/jobs/${p.id}`} className="text-brand-600 hover:underline">
                      {p.title}
                    </Link>{" "}
                    · {p.isRemote ? "Remote" : (p.city ?? "—")} · landing {p.landing}% · quality {p.quality}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
