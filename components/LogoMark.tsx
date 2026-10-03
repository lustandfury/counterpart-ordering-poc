import styles from "./LogoMark.module.css";

/** Centered CP monogram in the brand's yellow circle. */
export function LogoMark({ className = "", processing }: { className?: string; processing?: boolean }) {
  return (
    <span aria-hidden="true" className={`relative block shrink-0 ${className}`} data-logo="circle">
      <svg focusable="false" viewBox="0 0 32 32" className="block h-full w-full">
        <circle cx="16" cy="16" r="15" fill="var(--brand)" />
      </svg>
      {/* Rotate an HTML layer: SVG groups can flatten 3D transforms inconsistently. */}
      <span className={styles.mark} data-processing={processing}>
        <svg focusable="false" viewBox="0 0 32 32" fill="none" className="block h-full w-full">
          <g transform="translate(16 16) scale(0.9) translate(-16 -16)">
            <path d="M16 7.5h-4a6 6 0 0 0 0 12h4v-12h4a6 6 0 0 1 0 12h-4v5" stroke="var(--on-brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      </span>
    </span>
  );
}
