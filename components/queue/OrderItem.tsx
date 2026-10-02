import { CheckIcon } from "@heroicons/react/24/outline";
import { Pill } from "@/components/ui/Pill";

/** One order in the queue: its number, the company, the first lines of the text, and what's left to check. */
export function OrderItem(p: { id: string; tag: string; title: string; preview: string; time: string; count: number; sent: boolean; active: boolean; reading?: boolean; arriving?: boolean; onPick: (id: string) => void }) {
  // the first two lines of the text, as the contractor wrote them (the same text the message bubble shows)
  const previewLines = p.preview.trim().split("\n");
  const preview = previewLines.slice(0, 2);
  const hasMorePreview = previewLines.length > preview.length;
  return (
    <li className={p.arriving ? "queue-arrive" : undefined}>
      <button
        onClick={() => p.onPick(p.id)}
        aria-current={p.active ? "true" : undefined}
        aria-busy={p.reading || undefined}
        className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2.5 rounded-r-lg px-2.5 py-2.5 text-left ${p.active ? "bg-bg shadow-[inset_3px_0_0_var(--brand)]" : "hover:bg-bg"}`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className={`shrink-0 rounded-md bg-bg px-1.5 py-0.5 font-mono text-caption font-semibold leading-4 text-ink ${p.active ? "shadow-ring" : ""}`}>{p.tag}</span>
            <span className={`min-w-0 flex-1 truncate text-small ${p.active ? "font-semibold" : "font-medium"}`}>{p.title}</span>
          </span>
          <span className="mt-1 block text-caption leading-4 text-muted">{preview.map((line, i) => <span key={i} className="block truncate whitespace-pre">{line}{hasMorePreview && i === preview.length - 1 ? "..." : ""}</span>)}</span>
        </span>
        <span className="flex min-w-0 flex-col items-end justify-between gap-2 text-right">
          <span className="shrink-0 text-tiny text-muted">{p.time}</span>
          {p.reading ? (
            <span className="shrink-0 text-caption text-muted">Reading…</span>
          ) : p.sent ? (
            <span className="shrink-0 text-caption font-medium text-ok">Sent<span className="sr-only"> for approval</span></span>
          ) : p.count > 0 ? (
            <Pill tone="warn" className="shrink-0"><span aria-hidden>{p.count}</span><span className="sr-only">{p.count} to check</span></Pill>
          ) : (
            <span className="shrink-0 text-ok"><span aria-hidden><CheckIcon aria-hidden strokeWidth={2} className="h-4 w-4 shrink-0" /></span><span className="sr-only">Nothing to check</span></span>
          )}
        </span>
      </button>
    </li>
  );
}
