import { createHash } from "node:crypto";
import type { JSearchJob } from "./jsearch";
import type { TargetLocation } from "./searches";

export type RuleContext = {
  locations: TargetLocation[];
  remote: boolean;
  /** India-wide search (TOP 25): any city in India counts, not only the listed locations. */
  anywhereInIndia?: boolean;
  excludeTitleWords: string[];
  blockedEmployers: string[];
  maxAgeDays: number;
};

export type RuleOutcome =
  | { status: "new"; city: string | null; redFlags: string[] }
  | { status: "filtered"; stage: string; reason: string; city: string | null; redFlags: string[] };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRegex = (word: string) => new RegExp(`(^|[^a-z0-9])${escape(word.toLowerCase())}($|[^a-z0-9])`, "i");

/** Which target city a posting is in, judged by its city/state/location fields (or the title as a fallback). */
export function matchTargetCity(job: JSearchJob, locations: TargetLocation[]): string | null {
  const fields = [job.job_city, job.job_state, job.job_location].filter(Boolean).join(" | ");
  for (const pass of [fields, job.job_title]) {
    if (!pass) continue;
    for (const loc of locations) {
      if (loc.Aliases.split("|").some((alias) => alias && wordRegex(alias).test(pass))) return loc.City;
    }
  }
  return null;
}

export function normaliseEmployer(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(pvt|private|ltd|limited|llp|inc|corp|corporation|india|technologies|technology|solutions|services|co)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normaliseTitle(title: string, locations: TargetLocation[]): string {
  let t = title.toLowerCase();
  for (const loc of locations) for (const alias of loc.Aliases.split("|")) if (alias) t = t.replace(wordRegex(alias), " ");
  return t
    .replace(/\((india|remote|hybrid)\)/g, " ")
    .replace(/[^a-z0-9+#.]+/g, " ")
    .trim();
}

/** Same employer + title + city = the same job, even when listed on several job boards. */
export function dedupeKey(job: JSearchJob, city: string | null, locations: TargetLocation[]): string {
  const parts = [normaliseEmployer(job.employer_name), normaliseTitle(job.job_title, locations), city ?? "remote"];
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

const FEE_PATTERN =
  /\b(registration|security|training|processing|joining|interview)\s+(fee|fees|charges?|deposit)\b|\b(refundable|non-refundable)\s+deposit\b|\bpay\s+(a\s+)?(fee|deposit)\b/i;

/** Warning signs that do not reject a posting on their own but are shown to the user and to Gemini. */
function heuristicRedFlags(job: JSearchJob): string[] {
  const text = `${job.job_title}\n${job.job_description ?? ""}`;
  const flags: string[] = [];
  if (/\b(whats\s?app|telegram)\b/i.test(text)) flags.push("Asks you to contact them on WhatsApp/Telegram");
  if (/@(gmail|yahoo|hotmail|outlook|rediffmail)\.com/i.test(text)) flags.push("Recruiter uses a personal email address");
  if (/^(confidential|top mnc|leading|reputed|one of our client|hiring for|mnc)\b/i.test(job.employer_name.trim()))
    flags.push("Employer name is hidden or generic");
  if ((job.job_description ?? "").trim().length < 300) flags.push("Very short job description");
  if (/\bearn\s+(rs\.?|inr|₹)?\s?\d[\d,]*\s*(per|a|\/)\s*(day|week)\b/i.test(text)) flags.push("Earnings-per-day pitch");
  return flags;
}

export function applyRules(job: JSearchJob, ctx: RuleContext): RuleOutcome {
  const city = matchTargetCity(job, ctx.locations);
  const redFlags = heuristicRedFlags(job);
  const filtered = (stage: string, reason: string): RuleOutcome => ({ status: "filtered", stage, reason, city, redFlags });
  const text = `${job.job_title}\n${job.job_description ?? ""}`;

  if (FEE_PATTERN.test(text)) return filtered("scam", "Asks candidates to pay a fee or deposit");

  const employer = normaliseEmployer(job.employer_name);
  if (ctx.blockedEmployers.some((b) => b && employer === b)) return filtered("blocked", `You blocked ${job.employer_name}`);

  const excluded = ctx.excludeTitleWords.find((w) => w && wordRegex(w).test(job.job_title));
  if (excluded) return filtered("title", `Title contains "${excluded}"`);

  const types = job.job_employment_types ?? [];
  if (types.length > 0 && !types.includes("FULLTIME")) return filtered("type", `Not full-time (${types.join(", ").toLowerCase()})`);

  if (job.job_posted_at_datetime_utc) {
    const ageDays = (Date.now() - Date.parse(job.job_posted_at_datetime_utc)) / 86_400_000;
    if (ageDays > ctx.maxAgeDays) return filtered("age", `Posted ${Math.floor(ageDays)} days ago`);
  }

  const isRemote = !!job.job_is_remote || /\b(remote|work from home|wfh)\b/i.test(`${job.job_title} ${job.job_location ?? ""}`);
  if (ctx.anywhereInIndia) {
    const inIndia = (job.job_country ?? "").toUpperCase() === "IN";
    if (!inIndia && !(ctx.remote && isRemote)) return filtered("location", `Not in India (${job.job_location ?? "location not stated"})`);
    return { status: "new", city: city ?? job.job_city ?? null, redFlags };
  }
  if (ctx.remote) {
    // A remote search may still surface an office job in one of the target cities; that is fine too.
    if (!isRemote && !city) return filtered("location", `Not remote and not in your cities (${job.job_location ?? "location not stated"})`);
  } else if (!city) {
    return filtered("location", `Outside your cities (${job.job_location ?? job.job_city ?? "location not stated"})`);
  }

  return { status: "new", city, redFlags };
}
