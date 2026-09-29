import { z } from "zod";
import { describeDetails, getApplicantDetails } from "./applicant";
import { execute, query } from "./db";
import { generateJson } from "./gemini";
import { getJob } from "./jobs";
import { getProfile } from "./profile";

const QA = z.object({ question: z.string(), answer: z.string() });
const KeywordGap = z.object({
  keyword: z.string().describe("A skill or term the posting asks for that the resume does not mention"),
  suggestion: z.string().describe("How to address it honestly: related experience to mention, or accept it as a gap"),
});

// Letters are requested as paragraph lists: the model drops line breaks inside long JSON strings.
const GeneratedKitSchema = z.object({
  coverLetterParagraphs: z
    .array(z.string())
    .describe("Cover letter of 200-280 words as paragraphs: greeting, 3-4 body paragraphs, closing, sign-off with name"),
  resumeSummary: z.string().describe("60-90 word professional summary tailored to this job, for the summary box of forms"),
  keyPoints: z.array(z.string()).describe("4-6 short bullets: why the candidate fits this specific job, with resume evidence"),
  screeningAnswers: z.array(QA).describe("Answers to 6-8 questions this employer's form or recruiter is likely to ask"),
  keywordGaps: z.array(KeywordGap),
  recruiterSubject: z.string(),
  recruiterMessageParagraphs: z
    .array(z.string())
    .describe("Short note to the recruiter (email or LinkedIn), under 150 words, as paragraphs incl. greeting and sign-off"),
});

export type ApplicationKitContent = Omit<
  z.infer<typeof GeneratedKitSchema>,
  "coverLetterParagraphs" | "recruiterMessageParagraphs"
> & { coverLetter: string; recruiterMessage: string };

function toContent({
  coverLetterParagraphs,
  recruiterMessageParagraphs,
  ...rest
}: z.infer<typeof GeneratedKitSchema>): ApplicationKitContent {
  const join = (paragraphs: string[]) =>
    paragraphs
      .map((p) => p.trim())
      .filter(Boolean)
      .join("\n\n");
  return { ...rest, coverLetter: join(coverLetterParagraphs), recruiterMessage: join(recruiterMessageParagraphs) };
}

export type ApplicationKit = ApplicationKitContent & { model: string; generatedAt: Date; editedAt: Date | null };

const SYSTEM = `You help a senior software professional in India apply for jobs.
Write in clear, professional Indian business English, in the first person as the candidate.
Use ONLY facts from the resume and the candidate details. Never invent employers, projects, numbers, certifications or
skills. Never add results or outcomes the resume does not state (e.g. "improved performance", "reduced deployment
time", percentages); describe what was done, not imagined impact. Do not claim familiarity with tools the resume does
not mention. If the posting asks for something the resume lacks, do not claim it; address it honestly in keywordGaps.
Say nothing about the employer beyond what the posting itself states.
Cover letter and recruiter message: the greeting and the sign-off are separate paragraphs.
Where a needed detail is not provided (e.g. notice period), write a clear placeholder such as [your notice period].
Do not mention age, date of birth or years beyond what the resume states. Avoid clichés and exaggeration.
Screening answers: include any questions stated in the posting, then typical ones (years with the main technology,
why this role, notice period, current and expected CTC, location/relocation, a relevant achievement).`;

type KitRow = {
  CoverLetter: string;
  ResumeSummary: string;
  KeyPointsJson: string;
  ScreeningJson: string;
  KeywordGapsJson: string;
  RecruiterSubject: string;
  RecruiterMessage: string;
  Model: string;
  GeneratedAt: Date;
  EditedAt: Date | null;
};

export async function getKit(jobId: number): Promise<ApplicationKit | null> {
  const [row] = await query<KitRow>("SELECT * FROM dbo.ApplicationKits WHERE JobPostingId = @jobId", { jobId });
  if (!row) return null;
  return {
    coverLetter: row.CoverLetter,
    resumeSummary: row.ResumeSummary,
    keyPoints: JSON.parse(row.KeyPointsJson),
    screeningAnswers: JSON.parse(row.ScreeningJson),
    keywordGaps: JSON.parse(row.KeywordGapsJson),
    recruiterSubject: row.RecruiterSubject,
    recruiterMessage: row.RecruiterMessage,
    model: row.Model,
    generatedAt: row.GeneratedAt,
    editedAt: row.EditedAt,
  };
}

async function saveKit(jobId: number, kit: ApplicationKitContent, model: string | null) {
  // model = null means a manual edit: keep the original model and record the edit time.
  await execute(
    `MERGE dbo.ApplicationKits AS t USING (SELECT @jobId AS JobPostingId) AS s ON t.JobPostingId = s.JobPostingId
     WHEN MATCHED THEN UPDATE SET CoverLetter = @coverLetter, ResumeSummary = @resumeSummary, KeyPointsJson = @keyPoints,
          ScreeningJson = @screening, KeywordGapsJson = @gaps, RecruiterSubject = @subject, RecruiterMessage = @message,
          Model = COALESCE(@model, t.Model),
          GeneratedAt = CASE WHEN @model IS NULL THEN t.GeneratedAt ELSE SYSUTCDATETIME() END,
          EditedAt = CASE WHEN @model IS NULL THEN SYSUTCDATETIME() ELSE NULL END
     WHEN NOT MATCHED THEN INSERT (JobPostingId, CoverLetter, ResumeSummary, KeyPointsJson, ScreeningJson, KeywordGapsJson,
          RecruiterSubject, RecruiterMessage, Model)
          VALUES (@jobId, @coverLetter, @resumeSummary, @keyPoints, @screening, @gaps, @subject, @message, @model);`,
    {
      jobId,
      coverLetter: kit.coverLetter,
      resumeSummary: kit.resumeSummary,
      keyPoints: JSON.stringify(kit.keyPoints),
      screening: JSON.stringify(kit.screeningAnswers),
      gaps: JSON.stringify(kit.keywordGaps),
      subject: kit.recruiterSubject,
      message: kit.recruiterMessage,
      model,
    },
  );
}

async function promptContext(jobId: number) {
  const [job, profile, details] = await Promise.all([getJob(jobId), getProfile(), getApplicantDetails()]);
  if (!job) throw new Error("Job not found");
  if (!profile) throw new Error("Upload your resume on the Profile page first");
  const emails = [...new Set(job.Description.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? [])];
  return [
    `RESUME:\n${profile.ResumeText}`,
    `\nCANDIDATE DETAILS:\n${describeDetails(details)}`,
    `\nJOB: ${job.Title} at ${job.EmployerName} (${job.IsRemote ? "remote" : (job.City ?? "location unclear")})`,
    emails.length ? `Contact emails in the posting: ${emails.join(", ")}` : "No contact email in the posting.",
    `\nJOB DESCRIPTION:\n${job.Description.slice(0, 12000)}`,
  ].join("\n");
}

export async function generateKit(jobId: number): Promise<void> {
  const { data, model } = await generateJson(GeneratedKitSchema, await promptContext(jobId), SYSTEM);
  await saveKit(jobId, toContent(data), model);
}

export async function updateKit(jobId: number, kit: ApplicationKitContent): Promise<void> {
  await saveKit(jobId, kit, null);
}

/** Answers one extra question copied from an application form and adds it to the kit. */
export async function answerQuestion(jobId: number, question: string): Promise<void> {
  if (!question.trim()) throw new Error("Type the question from the application form");
  const kit = await getKit(jobId);
  if (!kit) throw new Error("Generate the application kit first");
  const { data } = await generateJson(
    z.object({ answer: z.string() }),
    `${await promptContext(jobId)}\n\nAnswer this question from the application form, in 40-150 words:\n${question}`,
    SYSTEM,
  );
  kit.screeningAnswers.push({ question: question.trim(), answer: data.answer });
  await saveKit(jobId, kit, null);
}

// ---------- Application records ----------

export type Application = {
  Id: number;
  Status: string;
  AppliedOn: Date;
  Method: string;
  AppliedUrl: string | null;
  Notes: string | null;
};

export async function getApplication(jobId: number): Promise<Application | null> {
  const [row] = await query<Application>(
    "SELECT Id, Status, AppliedOn, Method, AppliedUrl, Notes FROM dbo.Applications WHERE JobPostingId = @jobId",
    { jobId },
  );
  return row ?? null;
}

export async function markApplied(
  jobId: number,
  input: { appliedOn: string; method: string; appliedUrl: string; notes: string },
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.appliedOn)) throw new Error("Pick the date you applied");
  const [app] = await query<{ Id: number }>(
    `INSERT dbo.Applications (JobPostingId, AppliedOn, Method, AppliedUrl, Notes)
     OUTPUT inserted.Id VALUES (@jobId, @appliedOn, @method, @url, @notes)`,
    { jobId, appliedOn: input.appliedOn, method: input.method, url: input.appliedUrl.trim() || null, notes: input.notes.trim() || null },
  );
  await execute(
    "INSERT dbo.ApplicationEvents (ApplicationId, EventOn, Kind, Note) VALUES (@id, @on, N'applied', @note)",
    { id: app.Id, on: input.appliedOn, note: `Applied via ${input.method}` },
  );
  // Applying implies the job is wanted, even if it was never explicitly approved.
  await execute(
    "UPDATE dbo.JobPostings SET Status = N'approved', DecidedAt = COALESCE(DecidedAt, SYSUTCDATETIME()) WHERE Id = @jobId",
    { jobId },
  );
}

export async function undoApplied(jobId: number): Promise<void> {
  await execute("DELETE dbo.Applications WHERE JobPostingId = @jobId", { jobId });
}
