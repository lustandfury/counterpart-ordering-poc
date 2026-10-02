/** A row of mutually exclusive choices (a radio group drawn as buttons), e.g. Light / Dark / System. */
export function SegmentedControl<T extends string>({ options, value, onChange, labelledBy }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  labelledBy: string;
}) {
  return (
    <div className="inline-flex gap-1 rounded-xl bg-panel p-1 text-small shadow-ring" role="radiogroup" aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-8 rounded-lg px-3 font-medium ${value === o.value ? "bg-ink text-bg" : "text-muted hover:bg-bg hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
