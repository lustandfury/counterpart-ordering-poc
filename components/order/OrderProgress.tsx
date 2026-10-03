import { CheckIcon } from "@heroicons/react/24/outline";

const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Where the order is in its life, the same three stages as the inbox filter: the rep checks it (Open), sends it to the
 * contractor (Sent), and the contractor approves it on its way to the ERP (Approved). Done stages show a check and a time.
 */
export function OrderProgress({ sentAt, approvedAt }: { sentAt?: number; approvedAt?: number }) {
  const current = approvedAt ? 2 : sentAt ? 1 : 0;
  const steps = [
    { label: "Open", time: undefined },
    { label: "Sent", time: sentAt },
    { label: "Approved", time: approvedAt },
  ];
  return (
    <ol aria-label="Order status" className="mt-4 ml-12 flex items-start text-caption">
      {steps.map((s, i) => {
        const done = i < current || (i === 2 && current === 2);
        const here = i === current;
        return (
          <li key={s.label} aria-current={here ? "step" : undefined} className="flex min-w-0 flex-1 items-start last:flex-none">
            <span className="flex flex-col items-start">
              <span className={`flex items-center gap-1.5 whitespace-nowrap ${here ? "font-semibold text-ink" : done ? "text-ok" : "text-muted"}`}>
                <span aria-hidden className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${done ? "bg-fillok text-white" : here ? "bg-ink text-panel" : "border border-control"}`}>
                  {done ? <CheckIcon strokeWidth={3} className="h-2.5 w-2.5" /> : here ? <span className="h-1.5 w-1.5 rounded-full bg-panel" /> : null}
                </span>
                {s.label}
              </span>
              {s.time && <span className="figures mt-0.5 pl-5.5 text-muted">{clock(s.time)}</span>}
              <span className="sr-only">{done ? " (done)" : here ? " (current)" : " (not yet)"}</span>
            </span>
            {i < steps.length - 1 && <span aria-hidden className={`mx-2 mt-2 h-px flex-1 ${i < current ? "bg-[var(--fill-ok)]" : "bg-line"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
