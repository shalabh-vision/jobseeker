import type { Metadata } from "next";
import { connection } from "next/server";
import { refreshCitiesAction, refreshSwotAction } from "@/app/career/actions";
import { RefreshButton } from "@/app/career/refresh-button";
import { HowItWorks } from "@/components/how-it-works";
import type { CityResult } from "@/lib/career/cities";
import { getInsight } from "@/lib/career/store";
import type { SwotData } from "@/lib/career/swot";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Career map" };

function CityList({ cities, title, note }: { cities: CityResult[]; title: string; note?: string }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {note && <p className="text-sm text-gray-500">{note}</p>}
      </div>
      <ol className="space-y-2">
        {cities.map((c, i) => (
          <li key={c.name} className="flex gap-4 rounded-xl border border-brand-200/70 bg-white p-4 shadow-sm">
            <div className="flex w-12 shrink-0 flex-col items-center">
              <span className="text-xs text-gray-400">#{i + 1}</span>
              <span className="text-2xl font-bold text-brand-700">{c.score}</span>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold text-gray-900">{c.name}</p>
              <ul className="space-y-0.5 text-sm text-gray-700">
                {c.why.map((w) => (
                  <li key={w}>· {w}</li>
                ))}
              </ul>
              {c.postings.topRoles.length > 0 && <p className="text-xs text-gray-500">Strong-fit roles: {c.postings.topRoles.join("; ")}</p>}
            </div>
            <div className="hidden w-40 shrink-0 self-center sm:block">
              <div className="h-2 overflow-hidden rounded-full bg-brand-50">
                <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-500" style={{ width: `${c.score}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export default async function CareerMapPage() {
  await connection();
  const [cities, swot] = await Promise.all([getInsight<CityResult[]>("cities"), getInsight<SwotData>("swot")]);
  const role = swot?.data.role;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Career map</h1>
          <p className="text-gray-600">Where your work finds the most appreciation, and the role that suits you best next.</p>
        </div>
        <RefreshButton action={refreshCitiesAction} label="Refresh cities" hint="Recounts postings; 7 small World Bank requests" />
      </div>

      <HowItWorks>
        <ul>
          <li>
            <b>India</b>: ranked on the postings already in Sahi Naukri: how many fit your profile (your Discover rules and
            Gemini fit score), how many strongly (fit 70+), and the average fit. Small samples: read the counts.
          </li>
          <li>
            <b>Abroad</b>: no postings have been fetched for these cities (JSearch is off), so they are ranked on GDP per
            capita (PPP) from the World Bank only. A fair ranking needs postings from those cities.
          </li>
          <li>
            <b>Best next role</b>: from the SWOT analysis: each role your resume suits, with its postings, average fit and
            landing chance.
          </li>
        </ul>
      </HowItWorks>

      <section className="rounded-xl border border-accent-200 bg-gradient-to-br from-accent-50 to-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-accent-700">Best next role</p>
            <h2 className="text-2xl font-semibold text-brand-900">{role?.recommended ?? "Not analysed yet"}</h2>
          </div>
          <RefreshButton action={refreshSwotAction} label="Refresh analysis" hint="One Gemini call" />
        </div>
        {role && (
          <div className="mt-3 space-y-3">
            <p className="text-gray-800">{role.why}</p>
            <div>
              <p className="text-sm font-medium text-gray-900">Next steps</p>
              <ul className="ml-5 list-disc text-sm text-gray-700">
                {role.nextSteps.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            {role.alternatives.length > 0 && (
              <p className="text-sm text-gray-700">
                <span className="font-medium">Also strong:</span> {role.alternatives.map((a) => `${a.role} (${a.why})`).join("; ")}
              </p>
            )}
          </div>
        )}
        {swot && (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-1">Role your resume suits</th>
                <th className="py-1 text-right">Postings</th>
                <th className="py-1 text-right">Avg fit</th>
                <th className="py-1 text-right">Avg landing chance</th>
              </tr>
            </thead>
            <tbody>
              {[...swot.data.roles]
                .sort((a, b) => (b.avgLanding ?? 0) + (b.avgFit ?? 0) - ((a.avgLanding ?? 0) + (a.avgFit ?? 0)))
                .map((r) => (
                  <tr key={r.role} className={`border-t border-gray-100 ${r.role === role?.recommended ? "font-semibold text-brand-800" : ""}`}>
                    <td className="py-1.5">{r.role}</td>
                    <td className="py-1.5 text-right">{r.postings}</td>
                    <td className="py-1.5 text-right">{r.avgFit ?? "—"}</td>
                    <td className="py-1.5 text-right">{r.avgLanding !== null ? `${r.avgLanding}%` : "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>

      {cities ? (
        <>
          <p className="text-xs text-gray-500">Cities last refreshed {formatDateTime(cities.updatedAt)}</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <CityList title="India" cities={cities.data.filter((c) => c.region === "india")} />
            <CityList title="Abroad" note="Ranked on income only until postings exist for these cities." cities={cities.data.filter((c) => c.region === "abroad")} />
          </div>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">Press Refresh cities.</p>
      )}
    </div>
  );
}
