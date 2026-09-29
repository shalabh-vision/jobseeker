"use server";

import { revalidatePath } from "next/cache";
import { addBlockRule, approveJob, deleteBlockRule, rejectJob, restoreJob } from "@/lib/jobs";

const done = () => revalidatePath("/jobs", "layout");
const id = (formData: FormData) => Number(formData.get("id"));

export async function approveAction(formData: FormData) {
  await approveJob(id(formData));
  done();
}

export async function rejectAction(formData: FormData) {
  const preset = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  const reason = [preset, note].filter(Boolean).join(": ");
  await rejectJob(id(formData), reason, formData.get("blockEmployer") === "on");
  done();
}

export async function restoreAction(formData: FormData) {
  await restoreJob(id(formData));
  done();
}

export async function addBlockAction(formData: FormData) {
  await addBlockRule(formData.get("kind") === "employer" ? "employer" : "keyword", String(formData.get("value") ?? ""));
  done();
}

export async function deleteBlockAction(formData: FormData) {
  await deleteBlockRule(id(formData));
  done();
}
