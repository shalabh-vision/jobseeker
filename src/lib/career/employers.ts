// Best employers for the profile: strengths and weaknesses per company, gathered from the Gemini quality ratings of
// their postings (TOP 25 data: highlights, concerns, gaps, perks, pay, work mode) and cached Wikidata facts.
// Not employee review ratings: Glassdoor, AmbitionBox and Blind are blocked from this network. No downloads.
import { query } from "../db";
import { normaliseEmployer } from "../job-rules";
import { topScore, type CompanyFacts, type QualityDetails } from "../top-picks";

export type EmployerView = {
  name: string;
  logo: string | null;
  score: number;
  postings: { id: number; title: string; city: string | null; isRemote: boolean; landing: number; quality: number; fit: number | null }[];
  employerType: string;
  facts: CompanyFacts | null;
  strengths: string[];
  weaknesses: string[];
  perks: string[];
  pay: string[];
  workModes: string[];
};

const uniq = (xs: string[], n: number) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))].slice(0, n);

export async function listEmployers(limit = 30): Promise<EmployerView[]> {
  const rows = await query<{
    Id: number;
    Title: string;
    EmployerName: string;
    EmployerLogo: string | null;
    City: string | null;
    IsRemote: boolean;
    FitScore: number | null;
    LandingChance: number;
    QualityScore: number;
    QualityJson: string;
  }>(
    `SELECT Id, Title, EmployerName, EmployerLogo, City, IsRemote, FitScore, LandingChance, QualityScore, QualityJson
       FROM dbo.JobPostings
      WHERE QualityJson IS NOT NULL AND DuplicateOfId IS NULL AND Status IN (N'new', N'approved')`,
  );
  const facts = new Map(
    (
      await query<CompanyFacts & { EmployerKey: string }>(
        "SELECT EmployerKey, WikidataId, Label, Description, Employees, Founded, Industries, Country FROM dbo.CompanyFacts WHERE WikidataId IS NOT NULL",
      )
    ).map((f) => [f.EmployerKey, f]),
  );

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const d = JSON.parse(r.QualityJson) as QualityDetails;
    if (d.employerType === "consultancy-agency") continue; // agencies hide the employer
    const key = normaliseEmployer(r.EmployerName) || r.EmployerName.toLowerCase();
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  return [...groups]
    .map(([key, list]) => {
      const details = list.map((r) => JSON.parse(r.QualityJson) as QualityDetails);
      const scored = list.map((r) => ({ r, s: topScore(r.LandingChance, r.QualityScore) })).sort((a, b) => b.s - a.s);
      return {
        name: scored[0].r.EmployerName,
        logo: list.find((r) => r.EmployerLogo)?.EmployerLogo ?? null,
        score: scored[0].s,
        postings: scored.map(({ r }) => ({
          id: r.Id,
          title: r.Title,
          city: r.City,
          isRemote: r.IsRemote,
          landing: r.LandingChance,
          quality: r.QualityScore,
          fit: r.FitScore,
        })),
        employerType: details.map((d) => d.employerType).find((t) => t !== "unknown") ?? "unknown",
        facts: facts.get(key) ?? null,
        strengths: uniq(details.flatMap((d) => d.highlights), 4),
        // Weaknesses for this profile: the job's own downsides, then what stands between you and an offer.
        weaknesses: uniq([...details.flatMap((d) => d.concerns), ...details.flatMap((d) => d.gaps.filter((g) => g.effort !== "small").map((g) => `To land it: ${g.gap}`))], 4),
        perks: uniq(details.flatMap((d) => d.perks), 5),
        pay: uniq(details.map((d) => d.payStated ?? ""), 3),
        workModes: uniq(details.map((d) => (d.workMode === "unknown" ? "" : d.workMode)), 3),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
