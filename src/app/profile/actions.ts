"use server";

import { readFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { saveApplicantDetails } from "@/lib/applicant";
import { analyzeResume, saveResume } from "@/lib/profile";

export type ActionState = { error?: string; message?: string };

const MAX_BYTES = 5 * 1024 * 1024;

async function run(work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    revalidatePath("/profile");
    return { message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function uploadResume(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return run(async () => {
    const file = formData.get("resume");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a .docx file first");
    if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Only .docx resumes are supported");
    if (file.size > MAX_BYTES) throw new Error("Resume is larger than 5 MB");
    await saveResume(file.name, Buffer.from(await file.arrayBuffer()));
    await analyzeResume();
    return `Uploaded ${file.name} and analysed it`;
  });
}

/** Loads resume.docx from the project folder, so the file does not have to be picked by hand. */
export async function importProjectResume(): Promise<ActionState> {
  return run(async () => {
    const file = await readFile(path.join(process.cwd(), "resume.docx"));
    await saveResume("resume.docx", file);
    await analyzeResume();
    return "Imported resume.docx from the project folder and analysed it";
  });
}

export async function reanalyzeResume(): Promise<ActionState> {
  return run(async () => {
    await analyzeResume();
    return "Analysis refreshed";
  });
}

export async function saveDetailsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const text = (name: string) => String(formData.get(name) ?? "").trim();
  const lpa = (name: string) => {
    const raw = text(name);
    if (!raw) return null;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0 || value > 9999) throw new Error(`${name} must be a number in lakh per annum`);
    return value;
  };
  return run(async () => {
    await saveApplicantDetails({
      FullName: text("FullName"),
      Email: text("Email"),
      Phone: text("Phone"),
      CurrentLocation: text("CurrentLocation"),
      LinkedInUrl: text("LinkedInUrl"),
      PortfolioUrl: text("PortfolioUrl"),
      CurrentCtcLpa: lpa("CurrentCtcLpa"),
      ExpectedCtcLpa: lpa("ExpectedCtcLpa"),
      NoticePeriod: text("NoticePeriod"),
      Relocation: text("Relocation"),
      AdditionalInfo: text("AdditionalInfo"),
    });
    return "Details saved";
  });
}
