// SWOT for high-growth AI work, the best next role, and how to overcome the points against the profile.
// One Gemini call, grounded in evidence the code counts itself (no downloads):
//   - the resume analysis (strengths, gaps, skills, roles)
//   - skill demand in the AI-related postings already in the database
//   - each suitable role's postings: how many, fit, landing chance, quality
//   - the "To land it" gaps Gemini listed on the rated postings (TOP 25)
//   - the owner's own context: past projects stalled when team members left (user, 2026-10-15)
// Every point must cite evidence ids; points citing unknown ids are dropped.
import { z } from "zod";
import { query } from "../db";
import { generateJson } from "../gemini";
import { getProfile } from "../profile";
import { saveInsight } from "./store";

/** AI-sphere skills counted in postings; "has" is decided against the resume analysis. */
const AI_SKILLS: [string, RegExp, RegExp?][] = [
  ["Generative AI / LLMs", /\b(generative ai|genai|llms?|large language model)/i],
  ["RAG", /\b(rag|retrieval[- ]augmented)\b/i],
  ["AI agents", /\b(ai agents?|agentic|multi-agent)\b/i],
  ["Prompt engineering", /prompt engineering/i],
  ["Python", /\bpython\b/i],
  ["Machine learning", /machine learning|\bml\b/i],
  ["Deep learning (PyTorch / TensorFlow)", /pytorch|tensorflow|deep learning/i],
  ["LangChain / LlamaIndex", /langchain|llamaindex|semantic kernel/i],
  ["Vector databases", /vector (db|database|store)|pinecone|weaviate|qdrant|pgvector|faiss/i],
  ["MLOps", /mlops|model deployment|model monitoring/i],
  ["Azure AI / OpenAI", /azure (openai|ai)|openai/i],
  // Postings count any AWS mention; the resume only counts if it names the AI services themselves.
  ["AWS (SageMaker / Bedrock)", /sagemaker|bedrock|\baws\b/i, /sagemaker|bedrock/i],
  ["Kubernetes / Docker", /kubernetes|\bk8s\b|docker/i],
  // Resume test (third item) is stricter: any certificate on the resume is not a cloud certification.
  ["Cloud certification", /certif(ied|ication)/i, /(aws|azure|google cloud|gcp)[^.\n]{0,40}certif|certif[^.\n]{0,40}(aws|azure|gcp)|\bAZ-\d{3}\b|\bSAA-C0\d/i],
  ["Data engineering (Spark / Databricks)", /spark|databricks|data pipeline/i],
  ["NLP", /\bnlp\b|natural language/i],
  ["Computer vision", /computer vision|image recognition/i],
  [".NET / C#", /\.net|c#/i],
  ["System / solution architecture", /architect/i],
  ["Team leadership", /lead(ing|ership)? (a )?team|people manage|mentor/i, /\b(led|lead(ing|er|ership)?|managed|mentor(ed|ing)?|head(ed)?)\b[^.\n]{0,40}\b(teams?|engineers|developers)\b|people manage|team lead|\blead (developer|engineer|architect)/i],
];

const Point = z.object({ point: z.string(), evidence: z.array(z.string()).describe("Evidence ids (E1, E2...) this point rests on") });
const Insight = z.object({
  strengths: z.array(Point).min(3).max(6),
  weaknesses: z.array(Point).min(2).max(5),
  opportunities: z.array(Point).min(3).max(6).describe("Openings in the AI job market this candidate can take"),
  threats: z.array(Point).min(2).max(5).describe("Market forces that could hold this candidate back"),
  overcome: z
    .array(
      z.object({
        concern: z.string().describe("A point against the profile, as an interviewer or the postings would see it"),
        circumstantial: z.boolean().describe("True when it comes from circumstances (team members leaving, project stopped) rather than ability"),
        howToFrame: z.string().describe("What to say in an interview or on the resume, truthfully"),
        action: z.string().describe("One concrete step to close it"),
        effort: z.enum(["small", "medium", "large"]),
        evidence: z.array(z.string()),
      }),
    )
    .min(3)
    .max(7),
  role: z.object({
    recommended: z.string(),
    why: z.string(),
    evidence: z.array(z.string()),
    alternatives: z.array(z.object({ role: z.string(), why: z.string() })).max(3),
    nextSteps: z.array(z.string()).min(2).max(4),
  }),
});
export type SwotData = z.infer<typeof Insight> & {
  evidence: { id: string; text: string }[];
  skills: { skill: string; postings: number; has: boolean }[];
  roles: { role: string; postings: number; avgFit: number | null; avgLanding: number | null }[];
  aiPostings: number;
};

const SYSTEM = `You are a frank, supportive career strategist for one senior software professional in India.
Write a SWOT for moving into high-growth AI work, a role recommendation, and how to overcome the points against him.
Rules:
- Use ONLY the numbered evidence given. Every point cites the evidence ids it rests on. Do not invent numbers, companies,
  certifications held, or market statistics that are not in the evidence.
- Opportunities and threats are about the market as the evidence shows it (skill demand in AI postings, role demand,
  what postings ask for), not general claims.
- In "overcome", treat project setbacks caused by team members leaving as circumstantial, never as his failure; show how
  to present the work he did deliver (architecture, backend, decisions) truthfully, and how to protect future projects
  (handover discipline, documented ownership). Be practical, not flattering.
- Address him as "you".`;

export async function refreshSwot(): Promise<SwotData> {
  const profile = await getProfile();
  const a = profile?.analysis;
  if (!profile || !a) throw new Error("Analyse your resume on the Profile page first");
  // "On the resume" is checked against the full resume text and analysis, not only the skills list
  // (the first run marked team leadership missing although the headline says "Lead").
  const resumeSkills = [profile.ResumeText, a.headline, ...a.coreSkills, ...a.secondarySkills, ...a.strengths].join("\n");

  const postings = await query<{ Title: string; Description: string; FitScore: number | null; LandingChance: number | null; QualityScore: number | null; QualityJson: string | null }>(
    "SELECT Title, Description, FitScore, LandingChance, QualityScore, QualityJson FROM dbo.JobPostings WHERE DuplicateOfId IS NULL",
  );
  const ai = postings.filter((p) => /\b(ai|ml|llm|genai|machine learning|generative|data scien)/i.test(`${p.Title} ${p.Description.slice(0, 3000)}`));

  const skills = AI_SKILLS.map(([skill, re, resumeRe]) => ({
    skill,
    postings: ai.filter((p) => re.test(`${p.Title}\n${p.Description}`)).length,
    has: (resumeRe ?? re).test(resumeSkills),
  }))
    .filter((s) => s.postings > 0)
    .sort((x, y) => y.postings - x.postings);

  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x !== null);
    return v.length ? Math.round(v.reduce((n, x) => n + x, 0) / v.length) : null;
  };
  const roles = a.suitableRoles.map((r) => {
    const words = r.title.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 3 && !["senior", "principal"].includes(w));
    // AI roles must be AI postings: "AI/ML Solutions Architect" otherwise matched every "Solutions Architect".
    const aiRole = /\b(ai|ml|machine learning|llm)\b/i.test(r.title);
    const AI_TERMS = /\b(ai|ml|llm|genai|machine learning|generative)\b/i;
    const hits = postings.filter(
      (p) => words.every((w) => p.Title.toLowerCase().includes(w)) && (!aiRole || AI_TERMS.test(`${p.Title} ${p.Description.slice(0, 2000)}`)),
    );
    return { role: r.title, postings: hits.length, avgFit: avg(hits.map((h) => h.FitScore)), avgLanding: avg(hits.map((h) => h.LandingChance)) };
  });

  const gaps = postings
    .flatMap((p) => (p.QualityJson ? (JSON.parse(p.QualityJson).gaps ?? []) : []))
    .map((g: { gap: string }) => g.gap);
  const gapCounts = [...gaps.reduce((m, g) => m.set(g, (m.get(g) ?? 0) + 1), new Map<string, number>())].sort((x, y) => y[1] - x[1]).slice(0, 12);

  const evidence: { id: string; text: string }[] = [];
  const add = (text: string) => evidence.push({ id: `E${evidence.length + 1}`, text });
  add(`Profile: ${a.headline}; ${a.totalYearsExperience} years; seniority ${a.seniorityLevel}; IIT Kharagpur.`);
  add(`Core skills: ${a.coreSkills.join(", ")}. Also: ${a.secondarySkills.join(", ")}.`);
  add(`Domains: ${a.domains.join(", ")}.`);
  for (const s of a.strengths) add(`Resume strength: ${s}`);
  for (const g of a.gapsToAddress) add(`Resume gap: ${g}`);
  add(`${ai.length} of ${postings.length} postings in the database are AI-related.`);
  for (const s of skills.slice(0, 14)) add(`"${s.skill}" appears in ${s.postings} of ${ai.length} AI postings; ${s.has ? "on the resume" : "not on the resume"}.`);
  for (const r of roles) add(`Role "${r.role}": ${r.postings} postings; average fit ${r.avgFit ?? "n/a"}; average landing chance ${r.avgLanding ?? "n/a"}.`);
  for (const [g, n] of gapCounts) add(`Gap named on ${n} rated posting${n === 1 ? "" : "s"}: ${g}`);
  add("Owner's context: past projects stalled when other developers were moved to other assignments and left; he was left with incomplete work. This was circumstantial (team commitment), not his ability.");

  const ids = new Set(evidence.map((e) => e.id));
  const response = await generateJson(Insight, `EVIDENCE:\n${evidence.map((e) => `${e.id}: ${e.text}`).join("\n")}`, SYSTEM);
  const keep = <T extends { evidence: string[] }>(xs: T[]) =>
    xs.map((x) => ({ ...x, evidence: x.evidence.filter((e) => ids.has(e)) })).filter((x) => x.evidence.length > 0);
  const d = response.data;
  const data: SwotData = {
    strengths: keep(d.strengths),
    weaknesses: keep(d.weaknesses),
    opportunities: keep(d.opportunities),
    threats: keep(d.threats),
    overcome: keep(d.overcome),
    role: { ...d.role, evidence: d.role.evidence.filter((e) => ids.has(e)) },
    evidence,
    skills,
    roles,
    aiPostings: ai.length,
  };
  await saveInsight("swot", data, response.model);
  return data;
}
