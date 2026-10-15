// Career map: where the owner's work finds the most appreciation, ranked separately for India and abroad.
// Light on the network (office firewall, user 2026-10-15): no JSearch, no Wikidata, no page scraping.
//   - the app's own postings: how many fit the profile (rules + Gemini fit score) in each Indian city
//   - World Bank: GDP per capita, PPP (one small request per country)
// Abroad has no postings in the database yet, so it is ranked on income only and says so.
import { query } from "../db";
import { politeFetch, saveInsight } from "./store";

type CityConfig = { name: string; region: "india" | "abroad"; country: string; postingCities: string[] };

export const CITIES: CityConfig[] = [
  { name: "Tricity", region: "india", country: "IN", postingCities: ["Chandigarh", "Mohali", "Panchkula"] },
  { name: "Bengaluru", region: "india", country: "IN", postingCities: ["Bengaluru", "Bangalore"] },
  { name: "Pune", region: "india", country: "IN", postingCities: ["Pune", "Pimpri-Chinchwad"] },
  { name: "Noida", region: "india", country: "IN", postingCities: ["Noida", "Greater Noida"] },
  { name: "Gurugram", region: "india", country: "IN", postingCities: ["Gurugram", "Gurgaon"] },
  { name: "Mumbai", region: "india", country: "IN", postingCities: ["Mumbai", "Thane", "Navi Mumbai"] },
  { name: "Chennai", region: "india", country: "IN", postingCities: ["Chennai"] },
  { name: "Dubai", region: "abroad", country: "AE", postingCities: [] },
  { name: "Singapore", region: "abroad", country: "SG", postingCities: [] },
  { name: "London", region: "abroad", country: "GB", postingCities: [] },
  { name: "Amsterdam", region: "abroad", country: "NL", postingCities: [] },
  { name: "Berlin", region: "abroad", country: "DE", postingCities: [] },
  { name: "Toronto", region: "abroad", country: "CA", postingCities: [] },
  { name: "Seattle", region: "abroad", country: "US", postingCities: [] },
];

export type CityResult = {
  name: string;
  region: "india" | "abroad";
  country: string;
  score: number;
  postings: { total: number; fit: number; strong: number; avgFit: number | null; bestScore: number | null; topRoles: string[]; payStated: number };
  gdpPppPerCapita: number | null;
  gdpYear: string | null;
  why: string[];
};

async function gdpPpp(country: string): Promise<{ value: number | null; year: string | null }> {
  try {
    const r = await politeFetch(`https://api.worldbank.org/v2/country/${country}/indicator/NY.GDP.PCAP.PP.CD?format=json&mrnev=1`, { paceMs: 300 });
    const row = (await r.json())?.[1]?.[0];
    return { value: row?.value ?? null, year: row?.date ?? null };
  } catch {
    return { value: null, year: null };
  }
}

export async function refreshCities(): Promise<CityResult[]> {
  const postings = await query<{ City: string | null; FitScore: number | null; Status: string; Title: string; QualityJson: string | null }>(
    "SELECT City, FitScore, Status, Title, QualityJson FROM dbo.JobPostings WHERE DuplicateOfId IS NULL AND Country = N'IN'",
  );
  const gdp = new Map<string, { value: number | null; year: string | null }>();
  for (const c of new Set(CITIES.map((x) => x.country))) gdp.set(c, await gdpPpp(c));

  const results: CityResult[] = CITIES.map((c) => {
    const mine = postings.filter((p) => p.City && c.postingCities.some((n) => n.toLowerCase() === p.City!.toLowerCase()));
    const fit = mine.filter((p) => (p.FitScore ?? 0) >= 55 && p.Status !== "rejected");
    const strong = fit.filter((p) => (p.FitScore ?? 0) >= 70);
    const payStated = mine.filter((p) => p.QualityJson && JSON.parse(p.QualityJson).payStated).length;
    const g = gdp.get(c.country)!;
    return {
      name: c.name,
      region: c.region,
      country: c.country,
      score: 0,
      postings: {
        total: mine.length,
        fit: fit.length,
        strong: strong.length,
        avgFit: mine.length ? Math.round(mine.reduce((n, p) => n + (p.FitScore ?? 0), 0) / mine.length) : null,
        bestScore: fit.length ? Math.max(...fit.map((p) => p.FitScore ?? 0)) : null,
        topRoles: [...new Set(strong.map((p) => p.Title))].slice(0, 3),
        payStated,
      },
      gdpPppPerCapita: g.value,
      gdpYear: g.year,
      why: [],
    };
  });

  // India: strong-fit postings 50%, all fitting postings 30%, average fit 20% (small samples, so read the counts too).
  // Abroad: income only until postings exist for those cities.
  const india = results.filter((r) => r.region === "india");
  const max = (f: (r: CityResult) => number) => Math.max(1, ...india.map(f));
  const [mStrong, mFit] = [max((r) => r.postings.strong), max((r) => r.postings.fit)];
  for (const r of india) {
    r.score = Math.round(100 * (0.5 * (r.postings.strong / mStrong) + 0.3 * (r.postings.fit / mFit) + 0.2 * ((r.postings.avgFit ?? 0) / 100)));
    r.why = [
      `${r.postings.fit} of ${r.postings.total} postings found here fit your profile, ${r.postings.strong} strongly (fit 70+)`,
      r.postings.bestScore !== null && `best fit score ${r.postings.bestScore}`,
      r.postings.payStated > 0 && `${r.postings.payStated} state the pay`,
    ].filter((x): x is string => !!x);
  }
  const abroad = results.filter((r) => r.region === "abroad");
  const mGdp = Math.max(1, ...abroad.map((r) => r.gdpPppPerCapita ?? 0));
  for (const r of abroad) {
    r.score = Math.round(100 * ((r.gdpPppPerCapita ?? 0) / mGdp));
    r.why = [
      r.gdpPppPerCapita
        ? `GDP per capita (PPP) $${Math.round(r.gdpPppPerCapita).toLocaleString("en-US")} in ${r.gdpYear} (World Bank)`
        : "World Bank figure not available",
      "No postings fetched for this city yet",
    ];
  }
  results.sort((a, b) => b.score - a.score);
  await saveInsight("cities", results);
  return results;
}
