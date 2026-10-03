import styles from "./LogoMark.module.css";

// A counter slip in brand yellow: square top, torn zig-zag bottom edge.
const SLIP = "M4.5 2H27.5V30L24.625 28.5L21.75 30L18.875 28.5L16 30L13.125 28.5L10.25 30L7.375 28.5L4.5 30Z";

/** Centered CP monogram on a yellow counter slip. */
export function LogoMark({ className = "", processing }: { className?: string; processing?: boolean }) {
  return (
    <span aria-hidden="true" className={`relative block shrink-0 ${className}`} data-logo="slip">
      <svg focusable="false" viewBox="0 0 32 32" className="block h-full w-full">
        {/* the stroke in the same yellow softens the corners and teeth at small sizes */}
        <path d={SLIP} fill="var(--brand)" stroke="var(--brand)" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
      {/* Rotate an HTML layer: SVG groups can flatten 3D transforms inconsistently. */}
      <span className={styles.mark} data-processing={processing}>
        <svg focusable="false" viewBox="0 0 32 32" fill="none" className="block h-full w-full">
          <g transform="translate(16 16.5) scale(0.82) translate(-16 -16)">
            <path d="M16 7.5h-4a6 6 0 0 0 0 12h4v-12h4a6 6 0 0 1 0 12h-4v5" stroke="var(--on-brand)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        </svg>
      </span>
    </span>
  );
}
