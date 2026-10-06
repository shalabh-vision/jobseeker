// Technology stacks shown on the Vacancies tab, and how a posting is recognised as belonging to one.
// Client-safe: no Node APIs.

export type Stack = { slug: string; label: string; name: string; pattern: RegExp | null };

export const STACKS: Stack[] = [
  {
    slug: "dotnet",
    label: "DOTNET",
    name: ".NET",
    pattern: /(^|[^a-z0-9])(\.net|dot\s?net|asp\.net|c#|blazor|entity framework|ef core)([^a-z0-9]|$)/gi,
  },
  // Not built yet: no queries and no tagging.
  { slug: "js", label: "JS", name: "JavaScript", pattern: null },
  { slug: "ai-ml", label: "AI/ML", name: "AI/ML", pattern: null },
  { slug: "blockchain", label: "BLOCKCHAIN", name: "Blockchain", pattern: null },
];

export const getStack = (slug: string) => STACKS.find((s) => s.slug === slug);

const count = (re: RegExp, text: string) => text.match(re)?.length ?? 0;

/**
 * Stacks a posting belongs to: named in the title, or mentioned at least twice in the description
 * (a single passing mention such as "exposure to .NET a plus" does not count). Returns e.g. ",dotnet," or "".
 */
export function detectStacks(title: string, description: string): string {
  const found = STACKS.filter((s) => s.pattern && (count(s.pattern, title) > 0 || count(s.pattern, description) >= 2));
  return found.length ? `,${found.map((s) => s.slug).join(",")},` : "";
}
