import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AutoRefresh } from "@/app/settings/runs/controls";
import { HowItWorks } from "@/components/how-it-works";
import { JobDecisionButtons } from "@/components/job-card";
import { getRunningFetch, listFetchRuns } from "@/lib/fetch-run";
import { formatDate } from "@/lib/format";
import { getStringSetting } from "@/lib/settings";
import {
  LANDING_WEIGHT,
  listTopCompanies,
  listTopPickQueries,
  TOP_COMPANIES,
  type QualityGap,
  type TopCompany,
} from "@/lib/top-picks";
import { RefreshTopPicks } from "./refresh-button";

export const metadata: Metadata = { title: "Top 25" };

const EMPLOYER_TYPE: Record<string, string> = {
  product: "Product company",
  startup: "Startup",
  mnc: "MNC",
  enterprise: "Large enterprise",
  "it-services": "IT services",
  "consultancy-agency": "Consultancy / agency",
};
const EFFORT_TONE: Record<QualityGap["effort"], string> = {
  small: "bg-green-100 text-green-800",
  medium: "bg-amber-100 text-amber-800",
  large: "bg-red-100 text-red-800",
};
const pill = "rounded px-1.5 py-0.5";

function CompanyCard({ rank, company }: { rank: number; company: TopCompany }) {
  const { best, others } = company;
  const d = best.details;
  const facts = d.company;
  return (
    <li className="rounded-xl border border-brand-200/70 bg-white shadow-sm p-4">
      <div className="flex gap-4">
        <div className="flex w-12 shrink-0 flex-col items-center gap-1">
          <span className="text-xs text-gray-400">#{rank}</span>
          <span
            className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-accent-400 to-accent-600 text-lg font-bold text-white shadow-md ring-4 ring-accent-100"
            title="Overall: landing chance and job quality"
          >
            {company.score}
          </span>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {company.logo && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={company.logo} alt="" className="h-7 w-7 rounded object-contain" />
              )}
              <h2 className="text-lg font-semibold text-gray-900">{company.name}</h2>
              {d.employerType !== "unknown" && (
                <span className={`${pill} bg-gray-100 text-xs`}>{EMPLOYER_TYPE[d.employerType]}</span>
              )}
            </div>
            {/* Reject with "Never show again" blocks an agency or employer for good. */}
            <JobDecisionButtons job={best} />
          </div>
          {facts && (
            <p className="text-xs text-gray-500">
              Wikidata: {facts.Label}
              {facts.Industries && <> · {facts.Industries}</>}
              {facts.Employees && <> · {facts.Employees.toLocaleString("en-IN")} employees</>}
              {facts.Founded && <> · founded {facts.Founded}</>}
              {facts.Country && <> · {facts.Country}</>}
            </p>
          )}
          <div>
            <Link href={`/jobs/${best.Id}`} target="_blank" className="font-medium text-brand-600 hover:underline">
              {best.Title} <span className="text-xs text-gray-400">↗</span>
            </Link>
            <p className="text-sm text-gray-700">
              {best.IsRemote ? "Remote" : (best.City ?? "location unclear")} · posted {formatDate(best.PostedAt)}
              {best.Publisher && <> · via {best.Publisher}</>}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className={`${pill} bg-brand-50 text-brand-800`}>Landing chance {best.LandingChance}%</span>
            <span className={`${pill} bg-brand-50 text-brand-800`}>Job quality {best.QualityScore}</span>
            <span className={`${pill} bg-gray-100`}>Fit {best.FitScore}</span>
            <span className={`${pill} ${d.payStated ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>
              {d.payStated
                ? `Pay ${d.payStated}${d.payAssessment !== "unknown" ? ` (${d.payAssessment})` : ""}`
                : "Pay not stated"}
            </span>
            {d.workMode !== "unknown" && <span className={`${pill} bg-gray-100`}>{d.workMode}</span>}
            {d.perks.slice(0, 3).map((p) => (
              <span key={p} className={`${pill} bg-purple-50 text-purple-800`}>
                {p}
              </span>
            ))}
          </div>
          {d.highlights.length > 0 && (
            <ul className="ml-5 list-disc text-sm text-gray-700">
              {d.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          )}
          {d.gaps.length > 0 && (
            <div className="text-sm">
              <p className="font-medium text-gray-800">To land it</p>
              <ul className="mt-1 space-y-1">
                {d.gaps.map((g) => (
                  <li key={g.gap} className="flex gap-2">
                    <span className={`${pill} h-fit shrink-0 text-xs ${EFFORT_TONE[g.effort]}`}>{g.effort}</span>
                    <span className="text-gray-700">
                      <b className="font-medium">{g.gap}</b>: {g.plan}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {d.concerns.length > 0 && <p className="text-sm text-amber-800">Watch out: {d.concerns.join("; ")}</p>}
          {others.length > 0 && (
            <p className="text-xs text-gray-600">
              Also here:{" "}
              {others.map((o, i) => (
                <span key={o.Id}>
                  {i > 0 && ", "}
                  <Link href={`/jobs/${o.Id}`} target="_blank" className="text-brand-600 hover:underline">
                    {o.Title}
                  </Link>{" "}
                  ({o.score})
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export default async function TopPicksPage() {
  await connection();
  const [{ companies, pool, agencies, awaiting }, queries, running, [lastRun], excluded] = await Promise.all([
    listTopCompanies(),
    listTopPickQueries(),
    getRunningFetch(),
    listFetchRuns(1),
    getStringSetting("topPicks.excludeCities", ""),
  ]);
  const lastSearched = queries.reduce<Date | null>((m, q) => (q.LastRunAt && (!m || q.LastRunAt > m) ? q.LastRunAt : m), null);
  const landingPct = Math.round(LANDING_WEIGHT * 100);

  return (
    <div className="space-y-5">
      <AutoRefresh active={!!running} />
      <div>
        <h1 className="text-2xl font-semibold">Top {TOP_COMPANIES}</h1>
        <p className="text-gray-600">
          The best companies across India for you: jobs you have a good chance of landing, ranked with how good the job is.
        </p>
      </div>

      <HowItWorks>
        <ul>
          <li>
            <b>Which jobs</b>: every posting found anywhere in India or remote (weekly fetch, city searches and the India-wide
            search below) that passes your Discover rules: fit score 55 or more, not too junior, not fake.
          </li>
          <li>
            <b>Landing chance</b>: Gemini judges how likely you are to get an offer if you apply well and close the small or
            medium gaps it lists under &ldquo;To land it&rdquo;.
          </li>
          <li>
            <b>Job quality</b>: clear description, real scope, pay and work-life benefits <i>as stated in the posting</i>, and the
            employer (company facts from Wikidata where it has an entry). Recruitment agencies and job boards that hide the
            employer are left out; reject any that slip through with &ldquo;Never show again&rdquo;. Pay is never guessed; most
            Indian postings do not state it. Company review sites (Glassdoor, AmbitionBox) are blocked from this network.
          </li>
          <li>
            <b>Ranking</b>: each company by its best job: {landingPct}% landing chance, {100 - landingPct}% job quality.
            {excluded && <> Jobs in {excluded.split("|").join(", ")} are left out.</>}
          </li>
        </ul>
      </HowItWorks>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200/70 bg-white shadow-sm px-4 py-3 text-sm">
        <div className="text-gray-700">
          {running ? (
            <b>Fetch running now…</b>
          ) : (
            <>
              {pool} rated job{pool === 1 ? "" : "s"}
              {agencies > 0 && <> ({agencies} from recruitment agencies or job boards, left out)</>}
              {awaiting > 0 && <>, {awaiting} waiting to be rated (next fetch)</>} · India-wide search{" "}
              {lastSearched ? `last run ${formatDate(lastSearched)}` : "not run yet"}
              {lastRun?.ApiRequestsRemaining != null && <> · {lastRun.ApiRequestsRemaining} JSearch requests left</>}
            </>
          )}
        </div>
        <RefreshTopPicks running={!!running} queries={queries.length} />
      </div>

      {companies.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-gray-600">
          No rated jobs yet. Press <b>Search all India now</b>: it searches your roles and rates every job that passes your rules.
        </p>
      ) : (
        <ol className="space-y-3">
          {companies.map((c, i) => (
            <CompanyCard key={c.best.Id} rank={i + 1} company={c} />
          ))}
        </ol>
      )}
    </div>
  );
}
