import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AutoRefresh } from "@/app/settings/runs/controls";
import { HowItWorks } from "@/components/how-it-works";
import { getNextDueAt, getRunningFetch, listFetchRuns } from "@/lib/fetch-run";
import { formatDateTime } from "@/lib/format";
import { getStack, STACKS } from "@/lib/stacks";
import { countQueriesByCity, listVacancyCities, listVacancySections } from "@/lib/vacancies";
import { VacancyBrowser } from "../browser";
import { CityPicker } from "../city-picker";

export function generateStaticParams() {
  return STACKS.map((s) => ({ stack: s.slug }));
}

export async function generateMetadata({ params }: PageProps<"/vacancies/[stack]">) {
  const { stack } = await params;
  return { title: `${getStack(stack)?.name ?? "Vacancies"} vacancies` };
}

export default async function VacanciesPage({ params }: PageProps<"/vacancies/[stack]">) {
  const { stack: slug } = await params;
  const stack = getStack(slug);
  if (!stack) notFound();
  if (!stack.pattern) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">{stack.name} vacancies</h1>
        <p className="mt-2 text-sm text-gray-600">Not built yet.</p>
      </div>
    );
  }

  await connection();
  const [sections, cities, queryCounts, running, [lastRun], nextDue] = await Promise.all([
    listVacancySections(stack.slug),
    listVacancyCities(),
    countQueriesByCity(stack.slug),
    getRunningFetch(),
    listFetchRuns(1),
    getNextDueAt(),
  ]);
  const autoCities = cities.filter((c) => c.AutoFetch).map((c) => c.City);
  const pickable = cities
    .filter((c) => !c.AutoFetch && queryCounts.has(c.City))
    .map((c) => ({ city: c.City, queries: queryCounts.get(c.City) ?? 0, lastRunAt: c.LastRunAt }));

  return (
    <div className="space-y-5">
      <AutoRefresh active={!!running} />
      <div>
        <h1 className="text-2xl font-semibold">{stack.name} vacancies</h1>
        <p className="text-gray-600">
          Companies hiring {stack.name} engineers, busiest recruiters first. Open a company to see its postings that match
          your profile.
        </p>
      </div>

      <HowItWorks>
        <p>
          Every fetch run searches the job feed for {stack.name} postings in {autoCities.join(", ")}. Other cities are
          searched only when you tick them below, to save the JSearch monthly allowance.
        </p>
        <ul>
          <li>
            <b>Openings</b>: {stack.name} postings from the last 30 days (named in the title, or mentioned at least twice in
            the description). Duplicates, fakes, blocked employers and non-full-time jobs are left out.
          </li>
          <li>
            <b>For you</b>: postings that pass the same rules as Discover: Gemini fit score 55 or more, and not too junior
            (under 8 years asked, unless the score is 70+).
          </li>
          <li>Tricity lists up to 20 companies, other cities up to 10. Search finds every company and job title.</li>
        </ul>
      </HowItWorks>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-200/70 bg-white shadow-sm px-4 py-3 text-sm">
        <span className="text-gray-700">
          {running ? (
            <b>Fetch running now…</b>
          ) : lastRun ? (
            <>
              Last fetch {formatDateTime(lastRun.StartedAt)}
              {nextDue && <> · next weekly fetch due {formatDateTime(nextDue)}</>}
            </>
          ) : (
            "No fetch has run yet."
          )}
        </span>
        <Link href="/settings/runs" className="font-medium text-brand-600 hover:underline">
          Fetch runs →
        </Link>
      </div>

      <VacancyBrowser stack={stack.slug} sections={sections} />

      {pickable.length > 0 && (
        <section className="rounded-xl border border-brand-200/70 bg-white shadow-sm p-4">
          <h2 className="mb-1 font-semibold text-gray-900">Search other cities</h2>
          <p className="mb-3 text-sm text-gray-600">
            Not part of the weekly fetch. Tick the cities to search now; their top recruiters appear above.
          </p>
          <CityPicker cities={pickable} running={!!running} remaining={lastRun?.ApiRequestsRemaining ?? null} />
        </section>
      )}
    </div>
  );
}
