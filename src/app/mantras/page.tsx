import type { Metadata } from "next";
import { Noto_Serif_Devanagari } from "next/font/google";
import { ChantCounter } from "./chant-counter";

export const metadata: Metadata = { title: "Mantras" };

const devanagari = Noto_Serif_Devanagari({ subsets: ["devanagari"], weight: ["500", "700"] });

// Text supplied by the owner (2026-10-15), used exactly as given.
const NAMES: [string, string][] = [
  ["Vyavasāyah", "The embodiment of resolute effort, determination, and pure knowledge."],
  ["Vyavasthānah", "The basis or regulator of universal systems, granting structural stability."],
  ["Saṃsthānah", "The ultimate status or resting place."],
  ["Sthānadah", "The Giver of Position or Status according to one's actions."],
  ["Dhruvah", "The infinite, unshakeable, and permanent stability (just like the Pole Star given to the child devotee Dhruva)."],
  ["Pararddhih", "He who possesses supreme opulence and wealth."],
  ["Paramaspaṣṭah", "He whose greatness is completely evident; the provider of supreme clarity."],
  ["Tuṣṭah", "The embodiment of supreme joy and contentment."],
  ["Puṣṭah", "Perfectly complete, giving strength and nourishment."],
  ["Śubhekṣaṇah", "He whose auspicious glance brings blessings, success, and opportunities."],
];

export default function MantrasPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Mantras</h1>
        <p className="text-gray-600">
          The powerful verse from the Sri Vishnu Sahasranamam that is widely chanted to find a good job, achieve career
          stability, and secure promotions is called Shloka 42 (sometimes referred to as the Udyoga Sadhana Shloka or
          employment mantra).
        </p>
      </div>

      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-950 via-brand-900 to-brand-700 p-8 text-center text-white shadow-lg">
        <div
          aria-hidden
          className="absolute inset-0 opacity-10"
          style={{ background: "radial-gradient(circle at 50% 0%, var(--color-accent-300), transparent 60%)" }}
        />
        <p className="relative text-xs font-semibold uppercase tracking-[0.3em] text-accent-300">The Verse (Shloka 42)</p>
        <div className={`${devanagari.className} relative mt-5 space-y-2 text-2xl leading-relaxed sm:text-3xl`}>
          <p>व्यवसायो व्यवस्थानः संस्थानः स्थानदो ध्रुवः ।</p>
          <p>परर्द्धिः परमस्पष्टः तुष्टः पुष्टः शुभेक्षणः ॥ ४२ ॥</p>
        </div>
        <div className="relative mx-auto mt-6 max-w-xl border-t border-white/15 pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-200">Transliteration</p>
          <p className="mt-2 italic leading-relaxed text-brand-50">
            Vyavasāyō vyavasthānaḥ saṃsthānaḥ sthānadō dhruvaḥ |<br />
            Pararddhiḥ paramaspaṣṭaḥ tuṣṭaḥ puṣṭaḥ śubhekṣaṇaḥ || 42 ||
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-brand-200/70 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold">Meaning of Key Names in this Shloka</h2>
        <p className="mb-4 text-sm text-gray-600">
          This stanza contains 10 specific names of Lord Vishnu that directly align with focus, position, and long-term
          professional growth:
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {NAMES.map(([name, meaning]) => (
            <li key={name} className="rounded-lg border border-gray-200 bg-brand-50/40 p-3">
              <p className="font-semibold text-brand-800">{name}</p>
              <p className="text-sm text-gray-700">{meaning}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid gap-5 rounded-xl border border-brand-200/70 bg-white p-5 shadow-sm md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h2 className="mb-1 text-lg font-semibold">How it is Practised</h2>
          <p className="text-gray-700">
            Devotees tracking career milestones or looking to clear upcoming interviews traditionally take a vow (Sankalpa)
            and chant this specific verse 27 or 108 times daily—ideally during morning hours—for a period of 21, 41, or 90
            days.
          </p>
        </div>
        <ChantCounter />
      </section>
    </div>
  );
}
