// Client for JSearch (Google for Jobs) on RapidAPI. Only /search-v2 exists on the current plan.

const HOST = "jsearch.p.rapidapi.com";

export type JSearchJob = {
  job_id: string;
  job_uid?: string;
  job_title: string;
  employer_name: string;
  employer_logo?: string | null;
  employer_website?: string | null;
  job_publisher?: string | null;
  job_employment_type?: string | null;
  job_employment_types?: string[] | null;
  job_apply_link?: string | null;
  job_apply_is_direct?: boolean | null;
  apply_options?: { apply_link: string; is_direct: boolean; publisher: string }[] | null;
  job_description?: string | null;
  job_is_remote?: boolean | null;
  job_posted_at_datetime_utc?: string | null;
  job_location?: string | null;
  job_city?: string | null;
  job_state?: string | null;
  job_country?: string | null;
  job_google_link?: string | null;
  job_salary?: string | null;
  job_min_salary?: number | null;
  job_max_salary?: number | null;
  job_salary_period?: string | null;
  job_highlights?: Record<string, string[]> | null;
};

export type JSearchResult = { jobs: JSearchJob[]; requestsRemaining: number | null };

export async function searchJobs(options: {
  query: string;
  remote: boolean;
  datePosted: string;
}): Promise<JSearchResult> {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) throw new Error("RAPIDAPI_KEY is missing from .env");

  const params = new URLSearchParams({
    query: options.query,
    page: "1",
    num_pages: "1",
    country: "in",
    date_posted: options.datePosted,
    employment_types: "FULLTIME",
  });
  if (options.remote) params.set("work_from_home", "true");

  const response = await fetch(`https://${HOST}/search-v2?${params}`, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": HOST },
    signal: AbortSignal.timeout(60_000),
  });
  const remainingHeader = response.headers.get("x-ratelimit-requests-remaining");
  const requestsRemaining = remainingHeader === null ? null : Number(remainingHeader);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`JSearch ${response.status}: ${body?.message ?? JSON.stringify(body).slice(0, 200)}`);
  }
  return { jobs: body?.data?.jobs ?? [], requestsRemaining };
}
