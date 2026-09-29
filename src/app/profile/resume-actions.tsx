"use client";

import { useActionState } from "react";
import { importProjectResume, reanalyzeResume, uploadResume, type ActionState } from "./actions";

const button =
  "rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-wait disabled:opacity-60";

function Status({ state, pending }: { state: ActionState; pending: boolean }) {
  if (pending) return <p className="text-sm text-gray-600">Working… Gemini usually takes 5–20 seconds.</p>;
  if (state.error) return <p className="text-sm text-red-700">{state.error}</p>;
  if (state.message) return <p className="text-sm text-green-700">{state.message}</p>;
  return null;
}

export function ResumeActions({ hasResume }: { hasResume: boolean }) {
  const [uploadState, upload, uploading] = useActionState(uploadResume, {});
  const [importState, importLocal, importing] = useActionState(importProjectResume, {});
  const [analyzeState, analyze, analyzing] = useActionState(reanalyzeResume, {});
  const busy = uploading || importing || analyzing;

  return (
    <div className="space-y-3">
      <form action={upload} className="flex flex-wrap items-center gap-2">
        <input
          type="file"
          name="resume"
          accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          className="text-sm file:mr-2 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm"
        />
        <button type="submit" disabled={busy} className={`${button} bg-indigo-600 text-white hover:bg-indigo-700`}>
          Upload &amp; analyse
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        <form action={importLocal}>
          <button type="submit" disabled={busy} className={`${button} border border-gray-300 bg-white hover:bg-gray-50`}>
            Use resume.docx from project folder
          </button>
        </form>
        {hasResume && (
          <form action={analyze}>
            <button type="submit" disabled={busy} className={`${button} border border-gray-300 bg-white hover:bg-gray-50`}>
              Re-run analysis
            </button>
          </form>
        )}
      </div>
      <Status state={uploadState} pending={uploading} />
      <Status state={importState} pending={importing} />
      <Status state={analyzeState} pending={analyzing} />
    </div>
  );
}
