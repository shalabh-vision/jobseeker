"use client";

import { useSyncExternalStore } from "react";

// Today's count is kept in this browser only (a personal practice aid, not data the app needs).
const todayKey = () => `mantra-42-${new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })}`;
const TARGET_KEY = "mantra-42-target";
const EVENT = "mantra-42";

function read(key: string, fallback: number): number {
  try {
    return Number(localStorage.getItem(key) ?? fallback);
  } catch {
    return fallback; // storage unavailable (private window)
  }
}

function write(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function ChantCounter() {
  const count = useSyncExternalStore(subscribe, () => read(todayKey(), 0), () => 0);
  const target = useSyncExternalStore(subscribe, () => read(TARGET_KEY, 27), () => 27);
  const done = count >= target;
  const pct = Math.min(100, (count / target) * 100);

  return (
    <div className="flex flex-wrap items-center gap-6">
      <button
        onClick={() => write(todayKey(), count + 1)}
        className="relative flex h-36 w-36 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
        style={{ background: `conic-gradient(var(--color-accent-500) ${pct}%, var(--color-brand-800) ${pct}%)` }}
        aria-label="Count one recitation"
      >
        <span className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-brand-900">
          <span className="text-4xl font-bold">{count}</span>
          <span className="text-xs text-brand-200">of {target}</span>
        </span>
      </button>
      <div className="space-y-2 text-sm">
        <p className="text-gray-700">{done ? "Today's recitations are complete." : "Tap the circle after each recitation."}</p>
        <div className="flex gap-2">
          {[27, 108].map((t) => (
            <button
              key={t}
              onClick={() => write(TARGET_KEY, t)}
              className={`rounded-full px-3 py-1 ${target === t ? "bg-brand-700 text-white" : "bg-white text-brand-700 ring-1 ring-brand-200"}`}
            >
              {t} times
            </button>
          ))}
          <button onClick={() => write(todayKey(), 0)} className="rounded-full px-3 py-1 text-gray-500 ring-1 ring-gray-300 hover:bg-gray-50">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}
