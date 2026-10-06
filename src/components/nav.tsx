"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MaharajaMark } from "./maharaja-mark";

// Top menu has three sections; each section's pages show as sub-tabs under the menu.
// The first tab of a section is the page the top-menu item opens.
const sections = [
  {
    label: "Discover",
    tabs: [
      { href: "/searches", label: "Searches" },
      { href: "/jobs/discover", label: "Discover" },
      { href: "/settings/runs", label: "Fetch runs" },
    ],
  },
  {
    label: "Saved jobs",
    tabs: [
      { href: "/jobs/saved", label: "Saved jobs" },
      { href: "/applications", label: "Applications" },
    ],
  },
  {
    label: "Profile",
    tabs: [
      { href: "/profile", label: "Profile" },
      { href: "/help", label: "How it works" },
    ],
  },
  {
    label: "Vacancies",
    tabs: [
      { href: "/vacancies/top", label: "TOP 25" },
      { href: "/vacancies/dotnet", label: "DOTNET" },
      { href: "/vacancies/js", label: "JS" },
      { href: "/vacancies/ai-ml", label: "AI/ML" },
      { href: "/vacancies/blockchain", label: "BLOCKCHAIN" },
    ],
  },
];

export function Nav() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname.startsWith(href);
  const current = sections.find((s) => s.tabs.some((t) => isActive(t.href)));

  return (
    <header className="sticky top-0 z-20 bg-gradient-to-r from-brand-950 via-brand-900 to-brand-700 shadow-lg shadow-brand-950/20">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-6 flex items-center gap-2 text-lg font-bold tracking-tight text-white">
          <MaharajaMark className="h-9 w-9 rounded-[10px] shadow-md ring-2 ring-accent-400/70" />
          Sahi Naukri
        </Link>
        {sections.map((s) => (
          <Link
            key={s.label}
            href={s.tabs[0].href}
            className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${
              s === current ? "font-semibold text-white" : "text-brand-100 hover:bg-white/10 hover:text-white"
            }`}
          >
            {s.label}
            {s === current && <span className="absolute inset-x-3 -bottom-1 h-0.5 rounded-full bg-accent-400" />}
          </Link>
        ))}
        {/* The current section's sub-tabs sit on the right of the same bar. */}
        {current && (
          <div className="ml-auto flex items-center gap-1 rounded-full bg-white/10 p-1 ring-1 ring-white/15">
            {current.tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-full px-3 py-1 text-xs font-medium tracking-wide transition-colors ${
                  isActive(t.href) ? "bg-white text-brand-900 shadow" : "text-brand-100 hover:bg-white/10 hover:text-white"
                }`}
              >
                {t.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </header>
  );
}
