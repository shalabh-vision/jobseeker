"use server";

import { revalidatePath } from "next/cache";
import {
  addContact,
  addEvent,
  deleteContact,
  deleteEvent,
  deleteInterview,
  scheduleInterview,
  setInterviewOutcome,
  setStatus,
} from "@/lib/applications";

export type ActionState = { error?: string; message?: string };

const text = (formData: FormData, name: string) => String(formData.get(name) ?? "");
const num = (formData: FormData, name: string) => Number(formData.get(name));
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

function refresh(applicationId?: number) {
  revalidatePath("/applications");
  if (applicationId) revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/jobs", "layout");
}

async function attempt(applicationId: number, work: () => Promise<string>): Promise<ActionState> {
  try {
    const message = await work();
    refresh(applicationId);
    return { message };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
}

export async function addEventAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = num(formData, "applicationId");
  return attempt(id, async () => {
    await addEvent(id, { on: text(formData, "on"), kind: text(formData, "kind"), note: text(formData, "note") });
    return "Update added";
  });
}

export async function setStatusAction(formData: FormData) {
  const id = num(formData, "applicationId");
  await setStatus(id, text(formData, "status"), today());
  refresh(id);
}

export async function deleteEventAction(formData: FormData) {
  await deleteEvent(num(formData, "eventId"));
  refresh(num(formData, "applicationId"));
}

export async function addContactAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = num(formData, "applicationId");
  return attempt(id, async () => {
    await addContact(id, {
      Name: text(formData, "name").trim(),
      Role: text(formData, "role").trim(),
      Email: text(formData, "email").trim(),
      Phone: text(formData, "phone").trim(),
      Notes: text(formData, "notes").trim(),
    });
    return "Contact added";
  });
}

export async function deleteContactAction(formData: FormData) {
  await deleteContact(num(formData, "contactId"));
  refresh(num(formData, "applicationId"));
}

export async function scheduleInterviewAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = num(formData, "applicationId");
  return attempt(id, async () => {
    await scheduleInterview(id, {
      round: text(formData, "round"),
      localDateTime: text(formData, "scheduledAt"),
      mode: text(formData, "mode"),
      location: text(formData, "location"),
      interviewers: text(formData, "interviewers"),
      notes: text(formData, "notes"),
    });
    return "Interview scheduled";
  });
}

export async function interviewOutcomeAction(formData: FormData) {
  await setInterviewOutcome(num(formData, "interviewId"), text(formData, "outcome"), today());
  refresh(num(formData, "applicationId"));
}

export async function deleteInterviewAction(formData: FormData) {
  await deleteInterview(num(formData, "interviewId"));
  refresh(num(formData, "applicationId"));
}
