"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Pages are added here as they are built; `ready: false` shows them greyed out.
const links = [
  { href: "/jobs/discover", label: "Discover", ready: true },
  { href: "/jobs/saved", label: "Saved jobs", ready: true },
  { href: "/applications", label: "Applications", ready: true },
  { href: "/searches", label: "Searches", ready: true },
  { href: "/profile", label: "Profile", ready: true },
  { href: "/settings/runs", label: "Fetch runs", ready: true },
  { href: "/help", label: "How it works", ready: true },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="border-b border-gray-200 bg-white">
      <nav className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-6 text-lg font-semibold text-indigo-700">
          Sahi Naukri
        </Link>
        {links.map(({ href, label, ready }) =>
          ready ? (
            <Link
              key={href}
              href={href}
              className={`rounded-md px-3 py-1.5 text-sm ${
                pathname.startsWith(href) ? "bg-indigo-50 font-medium text-indigo-700" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              {label}
            </Link>
          ) : (
            <span key={href} className="cursor-default px-3 py-1.5 text-sm text-gray-400" title="Not built yet">
              {label}
            </span>
          ),
        )}
      </nav>
    </header>
  );
}
