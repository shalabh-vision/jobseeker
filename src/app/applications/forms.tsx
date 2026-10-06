"use client";

import { useActionState } from "react";
import { addContactAction, addEventAction, scheduleInterviewAction, type ActionState } from "./actions";

const input = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";
const primary = "rounded-md bg-accent-500 shadow-sm px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-600 disabled:opacity-60";

function Result({ state, pending }: { state: ActionState; pending: boolean }) {
  if (pending) return null;
  if (state.error) return <span className="text-sm text-red-700">{state.error}</span>;
  if (state.message) return <span className="text-sm text-green-700">{state.message}</span>;
  return null;
}

export function AddEventForm({
  applicationId,
  kinds,
  today,
}: {
  applicationId: number;
  kinds: { value: string; label: string }[];
  today: string;
}) {
  const [state, add, pending] = useActionState(addEventAction, {});
  return (
    <form action={add} className="grid gap-2 md:grid-cols-[10rem_14rem_1fr_auto] md:items-end">
      <input type="hidden" name="applicationId" value={applicationId} />
      <label className="text-sm">
        Date
        <input type="date" name="on" defaultValue={today} className={input} />
      </label>
      <label className="text-sm">
        What happened
        <select name="kind" className={input}>
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Details
        <input name="note" placeholder="e.g. Call with Priya from HR, asked about notice period" className={input} />
      </label>
      <button className={primary} disabled={pending}>
        Add
      </button>
      <div className="md:col-span-4">
        <Result state={state} pending={pending} />
      </div>
    </form>
  );
}

export function AddContactForm({ applicationId }: { applicationId: number }) {
  const [state, add, pending] = useActionState(addContactAction, {});
  return (
    <form action={add} className="grid gap-2 md:grid-cols-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <input name="name" required placeholder="Name" className={input} />
      <input name="role" placeholder="Role, e.g. HR / Hiring manager" className={input} />
      <input name="email" type="email" placeholder="Email" className={input} />
      <input name="phone" placeholder="Phone" className={input} />
      <input name="notes" placeholder="Notes" className={`${input} md:col-span-2`} />
      <div className="flex items-center gap-3">
        <button className={primary} disabled={pending}>
          Add contact
        </button>
        <Result state={state} pending={pending} />
      </div>
    </form>
  );
}

export function ScheduleInterviewForm({ applicationId }: { applicationId: number }) {
  const [state, schedule, pending] = useActionState(scheduleInterviewAction, {});
  return (
    <form action={schedule} className="grid gap-2 md:grid-cols-2">
      <input type="hidden" name="applicationId" value={applicationId} />
      <label className="text-sm">
        Round
        <input name="round" required placeholder="e.g. Technical round 1" className={input} />
      </label>
      <label className="text-sm">
        Date and time (Indian time)
        <input type="datetime-local" name="scheduledAt" required className={input} />
      </label>
      <label className="text-sm">
        Mode
        <select name="mode" className={input}>
          <option value="video">Video call</option>
          <option value="phone">Phone</option>
          <option value="in-person">In person</option>
        </select>
      </label>
      <label className="text-sm">
        Meeting link or address
        <input name="location" className={input} />
      </label>
      <label className="text-sm">
        Interviewers
        <input name="interviewers" placeholder="Names and roles, if known" className={input} />
      </label>
      <label className="text-sm">
        Notes
        <input name="notes" placeholder="e.g. System design focus; bring ID" className={input} />
      </label>
      <div className="flex items-center gap-3">
        <button className={primary} disabled={pending}>
          Schedule interview
        </button>
        <Result state={state} pending={pending} />
      </div>
    </form>
  );
}
