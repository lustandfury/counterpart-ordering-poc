"use client";

import posthog from "posthog-js";

type AnalyticsEvents = {
  order_selected: { source: "sample" | "live" };
  order_run_started: undefined;
  order_run_completed: { line_count: number };
  order_run_failed: undefined;
  signup_required: undefined;
  signup_completed: undefined;
  comparison_mode_changed: { mode: "jev" | "claude" };
  order_line_reviewed: { mode: "jev" | "claude"; decision: "product" | "not_in_catalog"; quantity_set: boolean };
  order_sent: { source: "sample" | "live"; mode: "jev" | "claude"; demo: true };
  order_approved: { demo: true };
  workspace_unlocked: undefined;
  portfolio_link_clicked: { from: "about" | "lock_screen" };
};

// Keep event properties limited to workflow metadata, never order text or contact details.
export function trackEvent<E extends keyof AnalyticsEvents>(event: E, properties?: AnalyticsEvents[E]) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Tracking failures must not interrupt an order action.
  }
}
