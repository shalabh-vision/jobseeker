import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { JobCard } from "@/components/job-card";
import { getStack } from "@/lib/stacks";
import { getCompanyVacancies } from "@/lib/vacancies";

export async function generateMetadata({ params }: PageProps<"/vacancies/[stack]/[company]">): Promise<Metadata> {
  await connection();
  const { stack, company } = await params;
  const data = await getCompanyVacancies(stack, company);
  return { title: data ? `${data.name} – ${getStack(stack)?.name ?? ""} vacancies` : "Vacancies" };
}

export default async function CompanyVacanciesPage({ params }: PageProps<"/vacancies/[stack]/[company]">) {
  await connection();
  const { stack: slug, company } = await params;
  const stack = getStack(slug);
  const data = stack?.pattern ? await getCompanyVacancies(slug, company) : null;
  if (!stack || !data) notFound();
  const total = data.matching.length + data.awaiting.length + data.others.length;

  return (
    <div className="space-y-5">
      <Link href={`/vacancies/${slug}`} className="text-sm text-indigo-700 hover:underline">
        ← All {stack.name} vacancies
      </Link>
      <div className="flex items-center gap-3">
        {data.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.logo} alt="" className="h-12 w-12 rounded object-contain" />
        )}
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-gray-600">
            {total} open {stack.name} posting{total === 1 ? "" : "s"} in {data.cities.join(", ")} · {data.matching.length}{" "}
            matching your profile
          </p>
        </div>
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Matching your profile</h2>
        {data.matching.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 p-4 text-sm text-gray-600">
            None of the current {stack.name} postings here passes your rules{data.awaiting.length ? " yet" : ""}.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.matching.map((job) => (
              <JobCard key={job.Id} job={job} />
            ))}
          </ul>
        )}
      </section>

      {data.awaiting.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-900">Waiting for a fit score</h2>
          <p className="text-sm text-gray-600">Gemini scores these on the next fetch run.</p>
          <ul className="space-y-3">
            {data.awaiting.map((job) => (
              <JobCard key={job.Id} job={job} />
            ))}
          </ul>
        </section>
      )}

      {data.others.length > 0 && (
        <details>
          <summary className="cursor-pointer text-lg font-semibold text-gray-900">
            Other {stack.name} openings ({data.others.length})
            <span className="ml-2 text-sm font-normal text-gray-500">filtered by your rules or rejected</span>
          </summary>
          <ul className="mt-2 space-y-3">
            {data.others.map((job) => (
              <JobCard key={job.Id} job={job} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
