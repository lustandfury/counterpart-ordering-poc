import type { OrderProgress, OrderStage } from "@/lib/order-progress";

const steps: { stage: OrderStage; title: string; detail: string }[] = [
  { stage: "access", title: "Check order availability", detail: "Confirm your usage allowance before processing." },
  { stage: "parse", title: "Read the order", detail: "Extract requested products, quantities, and units." },
  { stage: "jev", title: "Match products and check quantities", detail: "Jev checks catalog shortlists and quantities for matched products." },
  { stage: "claude", title: "Run the Claude comparison", detail: "Claude independently matches the order against the full catalog." },
];

export function OrderLoading({ progress }: { progress: Partial<Record<OrderStage, OrderProgress>> }) {
  const running = steps.filter(step => progress[step.stage]?.status === "running");
  return (
    <section aria-label="Order processing" className="space-y-5">
      <div className="card px-4 py-5 sm:px-6">
        <div className="flex items-center gap-3">
          <span aria-hidden className="order-loading-spinner h-5 w-5 shrink-0 rounded-full border-[3px] border-line border-t-brand" />
          <h1 className="text-xl font-semibold tracking-tight">Processing your order</h1>
        </div>
        <p className="mt-2 text-[13px] leading-relaxed text-muted">Live progress from your order. Both matching checks run in parallel after the order is read.</p>
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {running.length ? running.map(step => step.title).join(" and ") + " in progress." : "Preparing your order review."}
        </p>
        <ol className="mt-5 divide-y divide-line">
          {steps.map(({ stage, title, detail }, index) => {
            const step = progress[stage];
            const complete = step?.status === "complete";
            const active = step?.status === "running";
            return (
              <li key={stage} data-stage={stage} data-status={step?.status ?? "waiting"} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span aria-hidden className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold ${complete ? "bg-okbg text-ok" : active ? "bg-brand text-ink" : "bg-bg text-muted"}`}>
                  {complete ? "✓" : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <h2 className={`text-[14px] font-medium ${active || complete ? "text-ink" : "text-muted"}`}>{title}</h2>
                    <span className={`text-[12px] ${complete ? "text-ok" : "text-muted"}`}>{complete ? "Complete" : active ? "In progress" : "Waiting"}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-muted">{detail}</p>
                  {stage === "parse" && complete && step.total != null && <p className="mt-1 text-[12px] font-medium text-ok">{step.total} order {step.total === 1 ? "line" : "lines"} found</p>}
                  {stage === "jev" && step?.total != null && <p className="mt-1 text-[12px] font-medium text-muted">{step.completed ?? 0} of {step.total} lines processed</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <div aria-hidden="true" className="card overflow-hidden">
        <div className="border-b border-line px-4 py-4 sm:px-6"><div className="order-loading-bar h-4 w-36 rounded" /></div>
        {[80, 65, 90].map((width, index) => (
          <div key={width} className="flex items-center gap-3 border-b border-line px-4 py-5 last:border-0 sm:px-6">
            <div className="order-loading-bar h-7 w-7 shrink-0 rounded-full" style={{ animationDelay: `${index * 120}ms` }} />
            <div className="flex-1 space-y-2">
              <div className="order-loading-bar h-3 rounded" style={{ width: `${width}%`, animationDelay: `${index * 120}ms` }} />
              <div className="order-loading-bar h-3 w-1/2 rounded" style={{ animationDelay: `${index * 120}ms` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
