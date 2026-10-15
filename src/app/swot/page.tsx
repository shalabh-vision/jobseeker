import type { Metadata } from "next";
import { connection } from "next/server";
import { refreshSwotAction } from "@/app/career/actions";
import { RefreshButton } from "@/app/career/refresh-button";
import { HowItWorks } from "@/components/how-it-works";
import { getInsight } from "@/lib/career/store";
import type { SwotData } from "@/lib/career/swot";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "SWOT" };

const QUADRANTS: { key: "strengths" | "weaknesses" | "opportunities" | "threats"; title: string; tone: string }[] = [
  { key: "strengths", title: "Strengths", tone: "border-green-200 bg-green-50/60" },
  { key: "weaknesses", title: "Weaknesses", tone: "border-amber-200 bg-amber-50/60" },
  { key: "opportunities", title: "Opportunities", tone: "border-brand-200 bg-brand-50/60" },
  { key: "threats", title: "Threats", tone: "border-red-200 bg-red-50/50" },
];
const EFFORT: Record<string, string> = { small: "bg-green-100 text-green-800", medium: "bg-amber-100 text-amber-800", large: "bg-red-100 text-red-800" };

export default async function SwotPage() {
  await connection();
  const insight = await getInsight<SwotData>("swot");
  const d = insight?.data;
  const evidence = new Map(d?.evidence.map((e) => [e.id, e.text]) ?? []);
  const cite = (ids: string[]) => ids.map((id) => evidence.get(id)).filter(Boolean).join("\n");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">SWOT: high-growth AI work</h1>
          <p className="text-gray-600">Your strengths, weaknesses, opportunities and threats, and how to overcome the points against you.</p>
        </div>
        <RefreshButton action={refreshSwotAction} label="Refresh analysis" hint="One Gemini call, no downloads" />
      </div>

      <HowItWorks>
        <p>
          The code counts the evidence first: your resume analysis, which AI skills appear in the AI-related postings Sahi
          Naukri has found and whether your resume shows them, each suitable role&rsquo;s postings, the gaps listed on your
          rated jobs, and your own context (past projects stalled when team members left). Gemini then writes each point and
          must cite that evidence; points without valid evidence are dropped. Hover a point to see its evidence.
        </p>
      </HowItWorks>

      {!d ? (
        <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">Press Refresh analysis.</p>
      ) : (
        <>
          <p className="text-xs text-gray-500">
            Updated {formatDateTime(insight.updatedAt)} by {insight.model} · {d.aiPostings} AI-related postings counted
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {QUADRANTS.map((q) => (
              <section key={q.key} className={`rounded-xl border p-5 shadow-sm ${q.tone}`}>
                <h2 className="mb-2 text-lg font-semibold">{q.title}</h2>
                <ul className="space-y-2">
                  {d[q.key].map((p) => (
                    <li key={p.point} title={cite(p.evidence)} className="cursor-help text-sm leading-relaxed text-gray-800">
                      · {p.point}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          <section className="space-y-3 rounded-xl border border-brand-200/70 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Overcoming the points against you</h2>
            <ul className="space-y-4">
              {d.overcome.map((o) => (
                <li key={o.concern} className="space-y-1.5 rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-gray-900">{o.concern}</p>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${o.circumstantial ? "bg-brand-100 text-brand-800" : "bg-gray-100 text-gray-700"}`}>
                      {o.circumstantial ? "circumstantial" : "to work on"}
                    </span>
                    <span className={`rounded px-1.5 py-0.5 text-xs ${EFFORT[o.effort]}`}>{o.effort} effort</span>
                  </div>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">How to present it:</span> {o.howToFrame}
                  </p>
                  <p className="text-sm text-gray-700">
                    <span className="font-medium">What to do:</span> {o.action}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3 rounded-xl border border-brand-200/70 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">AI skills in demand</h2>
            <p className="text-sm text-gray-600">Share of the {d.aiPostings} AI-related postings that ask for each skill, and whether your resume shows it.</p>
            <ul className="space-y-1.5">
              {d.skills.map((s) => (
                <li key={s.skill} className="grid grid-cols-[13rem_1fr_5rem] items-center gap-3 text-sm">
                  <span className="truncate text-gray-800">{s.skill}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100">
                    <div className={`h-full rounded-full ${s.has ? "bg-green-500" : "bg-accent-500"}`} style={{ width: `${(s.postings / d.aiPostings) * 100}%` }} />
                  </div>
                  <span className={`text-right text-xs ${s.has ? "text-green-700" : "text-accent-700"}`}>
                    {s.postings} · {s.has ? "on resume" : "missing"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
