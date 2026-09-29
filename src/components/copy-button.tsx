"use client";

import { useState } from "react";

/** Copies `text`, or the current value of the element with id `targetId` (so unsaved edits are copied too). */
export function CopyButton({ text, targetId, label = "Copy" }: { text?: string; targetId?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const el = targetId ? (document.getElementById(targetId) as HTMLTextAreaElement | HTMLInputElement | null) : null;
        await navigator.clipboard.writeText(el?.value ?? text ?? "");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="rounded-md border border-gray-300 bg-white px-2 py-0.5 text-xs font-medium hover:bg-gray-50"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}
