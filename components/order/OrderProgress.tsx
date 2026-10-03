const clock = (at: number) => new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Where the order is in its life, the same three stages as the inbox filter: the order arrives and the rep checks it
 * (Received), sends it to the contractor (Sent), and the contractor approves it on its way to the ERP (Approved).
 * Each stage is a label and time over a thin bar segment, across the full width of the order card. Stages reached so
 * far are green (the current one bold); stages still to come are grey.
 */
export function OrderProgress({ receivedAt, sentAt, approvedAt }: { receivedAt?: number; sentAt?: number; approvedAt?: number }) {
  const current = approvedAt ? 2 : sentAt ? 1 : 0;
  const steps = [
    { label: "Received", time: receivedAt },
    { label: "Sent", time: sentAt },
    { label: "Approved", time: approvedAt },
  ];
  return (
    <ol aria-label="Order status" className="grid grid-cols-3 gap-1.5 text-caption">
      {steps.map((s, i) => {
        const reached = i <= current;
        return (
          <li key={s.label} aria-current={i === current ? "step" : undefined} className="min-w-0">
            <span className={`flex items-baseline gap-1 whitespace-nowrap ${reached ? "text-ok" : "text-muted"} ${i === current ? "font-semibold" : ""}`}>
              {s.label}
              {s.time && <span className="figures font-normal text-muted">{clock(s.time)}</span>}
            </span>
            <span aria-hidden className={`mt-1 block h-1 rounded-full ${reached ? "bg-fillok" : "bg-line"}`} />
            <span className="sr-only">{i < current ? " (done)" : i === current ? " (current)" : " (not yet)"}</span>
          </li>
        );
      })}
    </ol>
  );
}
