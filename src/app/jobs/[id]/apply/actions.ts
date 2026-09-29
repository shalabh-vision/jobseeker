"use server";

import { revalidatePath } from "next/cache";
import { answerQuestion, generateKit, getKit, markApplied, undoApplied, updateKit } from "@/lib/apply";

export type ActionState = { error?: string; message?: string };

const jobId = (formData: FormData) => Number(formData.get("jobId"));
const refresh = (id: number) => {
  revalidatePath(`/jobs/${id}/apply`);
  revalidatePath("/jobs", "layout");
};

async function attempt(id: number, work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    refresh(id);
    return { message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateKitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = jobId(formData);
  return attempt(id, async () => {
    await generateKit(id);
    return "Application kit written. Read it through before using it.";
  });
}

export async function saveKitAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = jobId(formData);
  return attempt(id, async () => {
    const kit = await getKit(id);
    if (!kit) throw new Error("Generate the application kit first");
    const questions = formData.getAll("question").map(String);
    const answers = formData.getAll("answer").map(String);
    await updateKit(id, {
      ...kit,
      coverLetter: String(formData.get("coverLetter") ?? ""),
      resumeSummary: String(formData.get("resumeSummary") ?? ""),
      recruiterSubject: String(formData.get("recruiterSubject") ?? ""),
      recruiterMessage: String(formData.get("recruiterMessage") ?? ""),
      // A cleared question removes that pair.
      screeningAnswers: questions
        .map((question, i) => ({ question: question.trim(), answer: (answers[i] ?? "").trim() }))
        .filter((qa) => qa.question),
    });
    return "Edits saved";
  });
}

export async function askQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = jobId(formData);
  return attempt(id, async () => {
    await answerQuestion(id, String(formData.get("question") ?? ""));
    return "Answer added to the screening answers below";
  });
}

export async function markAppliedAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = jobId(formData);
  return attempt(id, async () => {
    await markApplied(id, {
      appliedOn: String(formData.get("appliedOn") ?? ""),
      method: String(formData.get("method") ?? "Other"),
      appliedUrl: String(formData.get("appliedUrl") ?? ""),
      notes: String(formData.get("notes") ?? ""),
    });
    return "Marked as applied";
  });
}

export async function undoAppliedAction(formData: FormData) {
  const id = jobId(formData);
  await undoApplied(id);
  refresh(id);
}
