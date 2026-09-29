"use client";

import { useActionState } from "react";
import { askQuestionAction, generateKitAction, markAppliedAction, saveKitAction, type ActionState } from "./actions";

const primary = "rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60";
const input = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";

function Result({ state, pending, busyText }: { state: ActionState; pending: boolean; busyText?: string }) {
  if (pending) return busyText ? <span className="text-sm text-gray-600">{busyText}</span> : null;
  if (state.error) return <span className="text-sm text-red-700">{state.error}</span>;
  if (state.message) return <span className="text-sm text-green-700">{state.message}</span>;
  return null;
}

export function GenerateKitButton({ jobId, hasKit }: { jobId: number; hasKit: boolean }) {
  const [state, generate, pending] = useActionState(generateKitAction, {});
  return (
    <form
      action={generate}
      onSubmit={(e) => {
        if (hasKit && !confirm("Rewrite the whole kit? Your edits will be replaced.")) e.preventDefault();
      }}
      className="flex flex-wrap items-center gap-3"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <button className={primary} disabled={pending}>
        {pending ? "Writing…" : hasKit ? "Rewrite kit" : "Write application kit"}
      </button>
      <Result state={state} pending={pending} busyText="Gemini is tailoring your application; about 15 seconds." />
    </form>
  );
}

/** Wraps the editable kit fields (rendered by the server page) in a form with a save button. */
export function KitEditForm({ jobId, children }: { jobId: number; children: React.ReactNode }) {
  const [state, save, pending] = useActionState(saveKitAction, {});
  return (
    <form action={save} className="space-y-5">
      <input type="hidden" name="jobId" value={jobId} />
      {children}
      <div className="sticky bottom-0 flex items-center gap-3 border-t border-gray-200 bg-white/95 py-3">
        <button className={primary} disabled={pending}>
          Save edits
        </button>
        <Result state={state} pending={pending} />
      </div>
    </form>
  );
}

export function AskQuestionForm({ jobId }: { jobId: number }) {
  const [state, ask, pending] = useActionState(askQuestionAction, {});
  return (
    <form action={ask} className="space-y-2">
      <input type="hidden" name="jobId" value={jobId} />
      <textarea name="question" rows={2} required placeholder="Paste a question from the application form" className={input} />
      <div className="flex items-center gap-3">
        <button className={primary} disabled={pending}>
          {pending ? "Answering…" : "Answer it"}
        </button>
        <Result state={state} pending={pending} />
      </div>
    </form>
  );
}

const METHODS = ["Company website", "LinkedIn", "Naukri", "Indeed", "Other job board", "Email to recruiter", "Referral"];

export function MarkAppliedForm({ jobId, defaultUrl, today }: { jobId: number; defaultUrl: string; today: string }) {
  const [state, mark, pending] = useActionState(markAppliedAction, {});
  return (
    <form action={mark} className="grid gap-3 md:grid-cols-2">
      <input type="hidden" name="jobId" value={jobId} />
      <label className="text-sm">
        Applied on
        <input type="date" name="appliedOn" defaultValue={today} required className={input} />
      </label>
      <label className="text-sm">
        How
        <select name="method" className={input}>
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
      </label>
      <label className="text-sm md:col-span-2">
        Where (link)
        <input name="appliedUrl" defaultValue={defaultUrl} className={input} />
      </label>
      <label className="text-sm md:col-span-2">
        Notes (optional)
        <input name="notes" placeholder="e.g. referred by …, applied from phone" className={input} />
      </label>
      <div className="flex items-center gap-3">
        <button className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-60" disabled={pending}>
          Mark as applied
        </button>
        <Result state={state} pending={pending} />
      </div>
    </form>
  );
}
