import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;

if (token) {
  try {
    posthog.init(token, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
      defaults: "2026-05-30",
      capture_pageview: "history_change",
      autocapture: false,
      disable_surveys: true,
      person_profiles: "identified_only",
    });
  } catch {
    // Analytics must not prevent the app from starting.
  }
}
