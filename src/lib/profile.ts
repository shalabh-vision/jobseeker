import mammoth from "mammoth";
import { z } from "zod";
import { execute, query, sql, typed } from "./db";
import { generateJson } from "./gemini";

export const ProfileAnalysis = z.object({
  candidateName: z.string(),
  headline: z.string().describe("One-line professional headline"),
  totalYearsExperience: z.number().describe("Years of professional software/IT experience only; exclude non-IT careers"),
  seniorityLevel: z.enum(["mid", "senior", "lead", "principal", "executive"]),
  coreSkills: z.array(z.string()).describe("Skills the candidate is strongest in, most important first"),
  secondarySkills: z.array(z.string()),
  domains: z.array(z.string()).describe("Industry domains with real experience"),
  suitableRoles: z
    .array(
      z.object({
        title: z.string().describe("A job title as employers in India would post it"),
        fit: z.enum(["strong", "good", "stretch"]),
        rationale: z.string().describe("Why this role suits the candidate, citing resume evidence"),
        searchKeywords: z.array(z.string()).describe("2-4 extra words that sharpen a job search for this title"),
      }),
    )
    .describe("6-10 roles that best match the resume, strongest first"),
  excludeKeywords: z
    .array(z.string())
    .describe("Words in job titles that signal a posting is NOT for this candidate, e.g. fresher, intern, AutoCAD"),
  minimumRoleExperienceYears: z
    .number()
    .describe("Postings asking for fewer years than this are too junior for the candidate"),
  strengths: z.array(z.string()),
  gapsToAddress: z.array(z.string()).describe("Skills or credentials employers commonly ask for that the resume lacks"),
});
export type ProfileAnalysis = z.infer<typeof ProfileAnalysis>;

export type ProfileRow = {
  ResumeFileName: string;
  ResumeText: string;
  AnalysisJson: string | null;
  AnalysisModel: string | null;
  AnalyzedAt: Date | null;
  UploadedAt: Date;
};

export type Profile = Omit<ProfileRow, "AnalysisJson"> & { analysis: ProfileAnalysis | null };

export async function getProfile(): Promise<Profile | null> {
  const [row] = await query<ProfileRow>(
    "SELECT ResumeFileName, ResumeText, AnalysisJson, AnalysisModel, AnalyzedAt, UploadedAt FROM dbo.Profile WHERE Id = 1",
  );
  if (!row) return null;
  const { AnalysisJson, ...rest } = row;
  return { ...rest, analysis: AnalysisJson ? ProfileAnalysis.parse(JSON.parse(AnalysisJson)) : null };
}

/** Store a new resume. Clears the previous analysis because it no longer matches. */
export async function saveResume(fileName: string, file: Buffer): Promise<void> {
  const { value: text } = await mammoth.extractRawText({ buffer: file });
  if (text.trim().length < 200) throw new Error("Could not read enough text from this document. Is it a real resume .docx?");

  await execute(
    `MERGE dbo.Profile AS t USING (SELECT 1 AS Id) AS s ON t.Id = s.Id
     WHEN MATCHED THEN UPDATE SET ResumeFileName = @fileName, ResumeFile = @file, ResumeText = @text,
          AnalysisJson = NULL, AnalysisModel = NULL, AnalyzedAt = NULL, UploadedAt = SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (Id, ResumeFileName, ResumeFile, ResumeText) VALUES (1, @fileName, @file, @text);`,
    { fileName, file: typed(sql.VarBinary(sql.MAX), file), text: text.trim() },
  );
}

const SYSTEM = `You are an experienced technical recruiter in India who places senior software professionals.
Read the resume and judge it honestly. Base every statement on evidence in the resume; never invent experience.
Suggest job titles exactly as Indian employers post them on Naukri, LinkedIn and company career pages.
The candidate will read your analysis: address them as "you" in rationales, strengths and gaps.`;

export async function analyzeResume(): Promise<ProfileAnalysis> {
  const [row] = await query<{ ResumeText: string }>("SELECT ResumeText FROM dbo.Profile WHERE Id = 1");
  if (!row) throw new Error("Upload a resume first");

  const { data, model } = await generateJson(
    ProfileAnalysis,
    `Analyse this resume for a full-time job search in Noida, Gurugram, Delhi, Chandigarh, Panchkula and Mohali.\n\nRESUME:\n${row.ResumeText}`,
    SYSTEM,
  );

  await execute(
    "UPDATE dbo.Profile SET AnalysisJson = @json, AnalysisModel = @model, AnalyzedAt = SYSUTCDATETIME() WHERE Id = 1",
    { json: JSON.stringify(data), model },
  );
  return data;
}
