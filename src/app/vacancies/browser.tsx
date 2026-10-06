"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/format";
import type { VacancyCompany, VacancySection } from "@/lib/vacancies";

const matches = (c: VacancyCompany, words: string[]) => {
  const text = [c.name, ...c.cities, ...c.titles].join(" ").toLowerCase();
  return words.every((w) => text.includes(w));
};

function CompanyCard({ stack, company }: { stack: string; company: VacancyCompany }) {
  return (
    <li>
      <Link
        href={`/vacancies/${stack}/${company.slug}`}
        className="flex h-full gap-3 rounded-lg border border-gray-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm"
      >
        {company.logo ? (
          // External logo from the job feed; plain img avoids configuring every logo host for next/image.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={company.logo} alt="" className="h-10 w-10 shrink-0 rounded object-contain" />
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-indigo-50 font-semibold text-indigo-700">
            {company.name.charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate font-medium text-gray-900">{company.name}</p>
          <p className="text-xs text-gray-500">
            {company.cities.join(", ")} · latest {formatDate(company.latestPostedAt)}
          </p>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded bg-gray-100 px-1.5 py-0.5">
              {company.openings} opening{company.openings === 1 ? "" : "s"}
            </span>
            {company.matching > 0 && (
              <span className="rounded bg-green-100 px-1.5 py-0.5 text-green-800">
                {company.matching} for you · best {company.bestScore}
              </span>
            )}
            {company.awaiting > 0 && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">{company.awaiting} awaiting score</span>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}

export function VacancyBrowser({ stack, sections }: { stack: string; sections: VacancySection[] }) {
  const [search, setSearch] = useState("");
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const shown = sections
    .map((s) => {
      const found = searching ? s.companies.filter((c) => matches(c, words)) : s.companies.slice(0, s.topCompanies);
      return { ...s, shown: found };
    })
    .filter((s) => (searching ? s.shown.length > 0 : s.lastRunAt !== null));

  return (
    <div className="space-y-6">
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search companies, job titles or cities, e.g. Azure architect"
        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
      />
      {searching && shown.length === 0 && (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">
          No company or opening matches &ldquo;{search}&rdquo;.
        </p>
      )}
      {shown.map((s) => (
        <section key={s.section} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-900">
              {s.section}
              {s.cities.length > 1 && <span className="ml-2 text-sm font-normal text-gray-500">{s.cities.map((c) => c.City).join(", ")}</span>}
            </h2>
            <p className="text-xs text-gray-500">
              {s.companies.length} compan{s.companies.length === 1 ? "y" : "ies"}, {s.openings} opening{s.openings === 1 ? "" : "s"}
              {!searching && s.companies.length > s.topCompanies && <> · top {s.topCompanies} shown, search to find the rest</>}
              {" · "}searched {formatDate(s.lastRunAt)}
            </p>
          </div>
          {s.shown.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600">
              No open postings found in the last search.
            </p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {s.shown.map((c) => (
                <CompanyCard key={c.slug} stack={stack} company={c} />
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
