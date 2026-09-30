import Link from "next/link";

/** Switches between the review workspace and the sample-results dashboard. */
export function AppNav({ current }: { current: "review" | "results" }) {
  const tab = (href: string, key: "review" | "results", label: string) => (
    <Link
      href={href}
      aria-current={current === key ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-medium ${current === key ? "bg-panel text-ink shadow-[0_0_0_1px_var(--ring)]" : "text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );
  return (
    <nav aria-label="Pages" className="inline-flex gap-1 rounded-xl bg-bg p-1">
      {tab("/", "review", "Review")}
      {tab("/results", "results", "Sample results")}
    </nav>
  );
}
