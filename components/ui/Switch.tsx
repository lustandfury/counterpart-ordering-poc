/** An on/off switch. Label it with `labelledBy`, pointing at the visible text that names the setting. */
export function Switch({ on, onChange, labelledBy }: { on: boolean; onChange: (on: boolean) => void; labelledBy: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-labelledby={labelledBy}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-10 shrink-0 rounded-full shadow-ring transition-colors ${on ? "bg-ink" : "bg-bg"}`}
    >
      <span aria-hidden className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full shadow transition-transform ${on ? "translate-x-4 bg-bg" : "bg-muted"}`} />
    </button>
  );
}
