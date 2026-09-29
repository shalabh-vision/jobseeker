"use client";

import { useActionState } from "react";
import type { ApplicantDetails } from "@/lib/applicant";
import { saveDetailsAction } from "./actions";

const input = "w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm";

export function DetailsForm({ details }: { details: ApplicantDetails }) {
  const [state, save, pending] = useActionState(saveDetailsAction, {});
  const field = (name: keyof ApplicantDetails, label: string, placeholder = "", type = "text") => (
    <label className="text-sm">
      {label}
      <input name={name} type={type} step="0.1" defaultValue={details[name] ?? ""} placeholder={placeholder} className={input} />
    </label>
  );
  return (
    <form action={save} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        {field("FullName", "Full name")}
        {field("Email", "Email", "", "email")}
        {field("Phone", "Phone", "+91 …")}
        {field("CurrentLocation", "Current location", "e.g. Mohali, Punjab")}
        {field("LinkedInUrl", "LinkedIn URL", "https://www.linkedin.com/in/…")}
        {field("PortfolioUrl", "Portfolio / GitHub URL")}
        {field("CurrentCtcLpa", "Current CTC (lakh per annum)", "e.g. 30", "number")}
        {field("ExpectedCtcLpa", "Expected CTC (lakh per annum)", "e.g. 40", "number")}
        {field("NoticePeriod", "Notice period", "e.g. 30 days / immediate")}
      </div>
      {field("Relocation", "Relocation / commute", "e.g. Open to Noida and Gurugram; prefer Tricity")}
      <label className="block text-sm">
        Anything else forms often ask (optional)
        <textarea
          name="AdditionalInfo"
          rows={2}
          defaultValue={details.AdditionalInfo}
          placeholder="e.g. Open to hybrid; available for interviews on weekdays after 5 pm"
          className={input}
        />
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          Save details
        </button>
        {state.error && <span className="text-sm text-red-700">{state.error}</span>}
        {state.message && !pending && <span className="text-sm text-green-700">{state.message}</span>}
      </div>
    </form>
  );
}
