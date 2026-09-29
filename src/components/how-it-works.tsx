/** A collapsible "How this page works" panel, so each page explains itself. */
export function HowItWorks({ children, open = false }: { children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <summary className="cursor-pointer font-medium">How this page works</summary>
      <div className="mt-2 space-y-2 [&_li]:ml-5 [&_li]:list-disc">{children}</div>
    </details>
  );
}
