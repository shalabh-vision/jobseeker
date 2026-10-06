"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-6 text-lg font-semibold text-indigo-700">
          Sahi Naukri
        </Link>
        {sections.map((s) => (
          <Link
            key={s.label}
            href={s.tabs[0].href}
            className={`rounded-md px-3 py-1.5 text-sm ${
              s === current ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            {s.label}
          </Link>
        ))}
        {/* The current section's sub-tabs sit on the right of the same bar. */}
        {current && (
          <div className="ml-auto flex items-center gap-1 border-l border-gray-200 pl-3">
            {current.tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-md px-2.5 py-1 text-sm ${
                  isActive(t.href) ? "bg-indigo-600 font-medium text-white" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
