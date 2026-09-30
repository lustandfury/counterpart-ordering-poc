import type { OrderProgress, OrderStage } from "@/lib/order-progress";

const steps: { stage: OrderStage; title: string; detail: string }[] = [
  { stage: "access", title: "Usage check", detail: "Confirm your usage allowance before processing." },
  { stage: "parse", title: "Read order", detail: "Extract requested products, quantities, and units." },
  { stage: "jev", title: "Jev checks", detail: "Match catalog products and check quantities. Runs alongside the Claude comparison." },
  { stage: "claude", title: "Claude match", detail: "Independently match against the full catalog. Runs alongside Jev." },
];

export function OrderLoading({ progress }: { progress: Partial<Record<OrderStage, OrderProgress>> }) {
  const running = steps.filter(step => progress[step.stage]?.status === "running");
  return (
    <section aria-label="Order processing" className="space-y-3">
      <div className="card px-4 py-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="order-loading-spinner h-3.5 w-3.5 shrink-0 rounded-full border-2 border-line border-t-brand" />
          <h1 className="text-[14px] font-medium">Processing your order</h1>
        </div>
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {running.length ? running.map(step => step.title).join(" and ") + " in progress." : "Preparing your order review."}
        </p>
        <ol className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          {steps.map(({ stage, title, detail }) => {
            const step = progress[stage];
            const complete = step?.status === "complete";
            const active = step?.status === "running";
            return (
              <li key={stage} title={detail} data-stage={stage} data-status={step?.status ?? "waiting"} className="flex min-w-0 items-center gap-1.5 text-[12px]">
                <span aria-hidden className={`grid h-3 w-3 shrink-0 place-items-center ${complete ? "text-ok" : active ? "text-branddeep" : "text-muted/40"}`}>
                  {complete ? "✓" : "·"}
                </span>
                <span className={`min-w-0 ${active ? "font-medium text-ink" : "text-muted"}`}>{title}</span>
                <span className="sr-only">: {complete ? "Complete" : active ? "In progress" : "Waiting"}. {detail}</span>
                {stage === "jev" && step?.total != null && <span className="ml-auto shrink-0 tabular-nums text-muted"><span aria-hidden>{step.completed ?? 0}/{step.total}</span><span className="sr-only">{step.completed ?? 0} of {step.total} lines processed</span></span>}
              </li>
            );
          })}
        </ol>
      </div>
      <div aria-hidden="true" className="card overflow-hidden">
        <div className="border-b border-line px-4 py-3"><div className="order-loading-bar h-3 w-28 rounded" /></div>
        {[80, 65, 90].map((width, index) => (
          <div key={width} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-0">
            <div className="order-loading-bar h-5 w-5 shrink-0 rounded-full" style={{ animationDelay: `${index * 120}ms` }} />
            <div className="flex-1 space-y-1.5">
              <div className="order-loading-bar h-2.5 rounded" style={{ width: `${width}%`, animationDelay: `${index * 120}ms` }} />
              <div className="order-loading-bar h-2 w-1/2 rounded" style={{ animationDelay: `${index * 120}ms` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
