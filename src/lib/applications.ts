import { execute, query } from "./db";

export const STATUSES = ["applied", "screening", "interview", "offer", "rejected", "withdrawn"] as const;
export type ApplicationStatus = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  applied: "Applied",
  screening: "Screening",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

/** Timeline event kinds. Some move the application to a new status automatically. */
export const EVENT_KINDS = {
  note: { label: "Note", status: null },
  recruiter_contact: { label: "Recruiter contacted me", status: "screening" },
  screening: { label: "Screening call / test", status: "screening" },
  follow_up: { label: "I sent a follow-up", status: null },
  interview_scheduled: { label: "Interview scheduled", status: "interview" },
  interview_done: { label: "Interview done", status: null },
  offer: { label: "Offer received", status: "offer" },
  rejected: { label: "Rejected", status: "rejected" },
  withdrawn: { label: "I withdrew", status: "withdrawn" },
  applied: { label: "Applied", status: null },
  status: { label: "Status changed", status: null },
} as const satisfies Record<string, { label: string; status: ApplicationStatus | null }>;
export type EventKind = keyof typeof EVENT_KINDS;

// Days without any news after which a follow-up is suggested.
export const FOLLOW_UP_AFTER_DAYS = 10;

export type ApplicationSummary = {
  Id: number;
  JobPostingId: number;
  Status: ApplicationStatus;
  AppliedOn: Date;
  Method: string;
  Title: string;
  EmployerName: string;
  City: string | null;
  IsRemote: boolean;
  FitScore: number | null;
  LastEventOn: Date;
  NextInterviewAt: Date | null;
  NextInterviewRound: string | null;
};

export async function listApplications(): Promise<ApplicationSummary[]> {
  return query<ApplicationSummary>(
    `SELECT a.Id, a.JobPostingId, a.Status, a.AppliedOn, a.Method, j.Title, j.EmployerName, j.City, j.IsRemote, j.FitScore,
            (SELECT MAX(e.EventOn) FROM dbo.ApplicationEvents e WHERE e.ApplicationId = a.Id) AS LastEventOn,
            n.ScheduledAt AS NextInterviewAt, n.Round AS NextInterviewRound
       FROM dbo.Applications a
       JOIN dbo.JobPostings j ON j.Id = a.JobPostingId
       OUTER APPLY (SELECT TOP 1 i.ScheduledAt, i.Round FROM dbo.Interviews i
                     WHERE i.ApplicationId = a.Id AND i.Outcome = N'pending' AND i.ScheduledAt >= DATEADD(HOUR, -2, SYSUTCDATETIME())
                     ORDER BY i.ScheduledAt) n
      ORDER BY a.AppliedOn DESC, a.Id DESC`,
  );
}

export type ApplicationEvent = { Id: number; EventOn: Date; Kind: EventKind; Note: string | null; CreatedAt: Date };
export type Contact = { Id: number; Name: string; Role: string; Email: string; Phone: string; Notes: string };
export type Interview = {
  Id: number;
  Round: string;
  ScheduledAt: Date;
  Mode: "video" | "phone" | "in-person";
  Location: string;
  Interviewers: string;
  Notes: string;
  Outcome: "pending" | "passed" | "failed" | "cancelled" | "awaiting";
};

export type ApplicationDetail = ApplicationSummary & {
  AppliedUrl: string | null;
  Notes: string | null;
  EmployerWebsite: string | null;
  events: ApplicationEvent[];
  contacts: Contact[];
  interviews: Interview[];
};

export async function getApplicationDetail(id: number): Promise<ApplicationDetail | null> {
  const [app] = await query<Omit<ApplicationDetail, "events" | "contacts" | "interviews">>(
    `SELECT a.Id, a.JobPostingId, a.Status, a.AppliedOn, a.Method, a.AppliedUrl, a.Notes, j.Title, j.EmployerName, j.City,
            j.IsRemote, j.FitScore, j.EmployerWebsite,
            (SELECT MAX(e.EventOn) FROM dbo.ApplicationEvents e WHERE e.ApplicationId = a.Id) AS LastEventOn,
            NULL AS NextInterviewAt, NULL AS NextInterviewRound
       FROM dbo.Applications a JOIN dbo.JobPostings j ON j.Id = a.JobPostingId
      WHERE a.Id = @id`,
    { id },
  );
  if (!app) return null;
  const [events, contacts, interviews] = await Promise.all([
    query<ApplicationEvent>(
      "SELECT Id, EventOn, Kind, Note, CreatedAt FROM dbo.ApplicationEvents WHERE ApplicationId = @id ORDER BY EventOn DESC, Id DESC",
      { id },
    ),
    query<Contact>("SELECT Id, Name, Role, Email, Phone, Notes FROM dbo.ApplicationContacts WHERE ApplicationId = @id ORDER BY Id", { id }),
    query<Interview>(
      "SELECT Id, Round, ScheduledAt, Mode, Location, Interviewers, Notes, Outcome FROM dbo.Interviews WHERE ApplicationId = @id ORDER BY ScheduledAt",
      { id },
    ),
  ]);
  return { ...app, events, contacts, interviews };
}

async function logEvent(applicationId: number, on: string, kind: EventKind, note: string | null) {
  await execute(
    "INSERT dbo.ApplicationEvents (ApplicationId, EventOn, Kind, Note) VALUES (@applicationId, @on, @kind, @note)",
    { applicationId, on, kind, note },
  );
}

async function updateStatus(applicationId: number, status: ApplicationStatus) {
  await execute("UPDATE dbo.Applications SET Status = @status, UpdatedAt = SYSUTCDATETIME() WHERE Id = @applicationId", {
    applicationId,
    status,
  });
}

const checkDate = (on: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(on)) throw new Error("Pick a date");
};

export async function addEvent(applicationId: number, input: { on: string; kind: string; note: string }) {
  checkDate(input.on);
  if (!(input.kind in EVENT_KINDS)) throw new Error("Unknown update type");
  const kind = input.kind as EventKind;
  await logEvent(applicationId, input.on, kind, input.note.trim() || null);
  const status = EVENT_KINDS[kind].status;
  if (status) await updateStatus(applicationId, status);
}

export async function setStatus(applicationId: number, status: string, today: string) {
  if (!STATUSES.includes(status as ApplicationStatus)) throw new Error("Unknown status");
  await updateStatus(applicationId, status as ApplicationStatus);
  await logEvent(applicationId, today, "status", `Status set to ${STATUS_LABELS[status as ApplicationStatus]}`);
}

export async function deleteEvent(eventId: number) {
  await execute("DELETE dbo.ApplicationEvents WHERE Id = @eventId AND Kind <> N'applied'", { eventId });
}

export async function addContact(applicationId: number, c: Omit<Contact, "Id">) {
  if (!c.Name.trim()) throw new Error("Contact name is required");
  await execute(
    `INSERT dbo.ApplicationContacts (ApplicationId, Name, Role, Email, Phone, Notes)
     VALUES (@applicationId, @Name, @Role, @Email, @Phone, @Notes)`,
    { applicationId, ...c },
  );
}

export async function deleteContact(contactId: number) {
  await execute("DELETE dbo.ApplicationContacts WHERE Id = @contactId", { contactId });
}

/** `localDateTime` is the value of a datetime-local input, entered in Indian time. */
export async function scheduleInterview(
  applicationId: number,
  input: { round: string; localDateTime: string; mode: string; location: string; interviewers: string; notes: string },
) {
  if (!input.round.trim()) throw new Error("Name the round, e.g. Technical round 1");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.localDateTime)) throw new Error("Pick the interview date and time");
  if (!["video", "phone", "in-person"].includes(input.mode)) throw new Error("Unknown interview mode");
  const scheduledAt = new Date(`${input.localDateTime}:00+05:30`);
  await execute(
    `INSERT dbo.Interviews (ApplicationId, Round, ScheduledAt, Mode, Location, Interviewers, Notes)
     VALUES (@applicationId, @round, @scheduledAt, @mode, @location, @interviewers, @notes)`,
    {
      applicationId,
      round: input.round.trim(),
      scheduledAt,
      mode: input.mode,
      location: input.location.trim(),
      interviewers: input.interviewers.trim(),
      notes: input.notes.trim(),
    },
  );
  const when = input.localDateTime.replace("T", " at ");
  await addEvent(applicationId, {
    on: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
    kind: "interview_scheduled",
    note: `${input.round.trim()} on ${when} (${input.mode})`,
  });
}

export async function setInterviewOutcome(interviewId: number, outcome: string, today: string) {
  if (!["pending", "passed", "failed", "cancelled", "awaiting"].includes(outcome)) throw new Error("Unknown outcome");
  const [iv] = await query<{ ApplicationId: number; Round: string }>(
    "SELECT ApplicationId, Round FROM dbo.Interviews WHERE Id = @interviewId",
    { interviewId },
  );
  if (!iv) throw new Error("Interview not found");
  await execute("UPDATE dbo.Interviews SET Outcome = @outcome WHERE Id = @interviewId", { interviewId, outcome });
  const text = { pending: "reset to upcoming", passed: "cleared", failed: "not cleared", cancelled: "cancelled", awaiting: "done, awaiting result" }[outcome];
  await logEvent(iv.ApplicationId, today, "interview_done", `${iv.Round}: ${text}`);
}

export async function deleteInterview(interviewId: number) {
  await execute("DELETE dbo.Interviews WHERE Id = @interviewId", { interviewId });
}

export async function getApplicationIdForJob(jobId: number): Promise<number | null> {
  const [row] = await query<{ Id: number }>("SELECT Id FROM dbo.Applications WHERE JobPostingId = @jobId", { jobId });
  return row?.Id ?? null;
}
