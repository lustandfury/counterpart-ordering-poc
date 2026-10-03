import styles from "./OrderIllustration.module.css";

/**
 * A contractor's message and the counter slip it becomes. Motion is decorative. "complete" (all caught up) plays once:
 * each line on the slip is ticked off in turn, then the approval stamp lands and its check draws.
 */
export function OrderIllustration({ state = "waiting", className = "" }: {
  state?: "waiting" | "arrived" | "complete" | "idle";
  className?: string;
}) {
  const message = (
    <g className={styles.message}>
      <path d="M62 15h30a7 7 0 0 1 7 7v15a7 7 0 0 1-7 7H80l-9 7v-7h-9a7 7 0 0 1-7-7V22a7 7 0 0 1 7-7Z" fill="var(--brand-soft)" stroke="var(--brand-deep)" strokeWidth="1.5" />
      <g fill="var(--brand-deep)">
        <circle className={styles.dot} cx="68" cy="30" r="2" />
        <circle className={styles.dot} cx="77" cy="30" r="2" />
        <circle className={styles.dot} cx="86" cy="30" r="2" />
      </g>
    </g>
  );
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 112 104" className={`${styles.illustration} ${className}`} data-state={state} fill="none">
      <ellipse cx="56" cy="89" rx="35" ry="4" fill="var(--ink)" opacity="0.05" />
      {/* The slip (x 28-75) is shifted 4.5 so it centres on the ground lines (x 16-96), with its message and stamp.
          An outer group, because the inner ones animate with CSS transforms, which would replace a transform attribute. */}
      <g transform="translate(4.5 0)">
        {/* waiting and arriving: the text comes first and the slip in front of it, as the order is written up */}
        {(state === "waiting" || state === "arrived") && message}
        <g className={styles.slip}>
          <path d="M28 27h35l12 12v45l-6-3-6 3-6-3-6 3-6-3-6 3-6-3-5 3V27Z" fill="var(--panel)" stroke="var(--muted)" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M63 27v12h12" stroke="var(--muted)" strokeWidth="1.5" strokeLinejoin="round" />
          <rect x="36" y="37" width="15" height="4" rx="1" fill="var(--brand)" />
          <g stroke="var(--muted)" strokeWidth="2" strokeLinecap="round">
            <path className={styles.row} d="M37 50h24" />
            <path className={styles.row} d="M37 58h18" />
            <path className={styles.row} d="M37 66h13" />
          </g>
        </g>
        {/* the empty Sent and Approved tabs: the message sits in front of the slip, the order out with the contractor */}
        {state === "idle" && message}
        {/* the approval stamp, drawn over the slip */}
        {state === "complete" && (
          <g className={styles.stamp}>
            <circle cx="70" cy="68" r="12" fill="var(--ok-bg)" stroke="var(--ok)" strokeWidth="1.5" />
            <path className={styles.tick} pathLength={1} d="m64.5 68 3.5 3.5 7-8" stroke="var(--ok)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}
      </g>
      <path d="M16 89h80" stroke="var(--muted)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      <path d="M24 94h64" stroke="var(--line)" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
