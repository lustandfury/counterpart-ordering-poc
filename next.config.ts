import { withPostHogConfig } from "@posthog/nextjs-config";
import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Content Security Policy, sent report-only first: violations show in the browser console without blocking anything.
// Next.js and the theme script are inline, so 'unsafe-inline' stays until nonces are worth the cost of dynamic pages.
// PostHog needs its script/asset host and its ingestion host.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://us-assets.i.posthog.com`,
  "connect-src 'self' https://us.i.posthog.com https://us-assets.i.posthog.com",
  "worker-src 'self' blob:",
  "img-src 'self' data: blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // the dev-mode badge sits on top of the sidebar's composer
  devIndicators: false,
  // the live-run route reads the catalog and house rules at request time
  outputFileTracingIncludes: {
    "/api/run": ["./data/catalog.json", "./data/house-defaults.md"],
    // the review page renders per request (it reads ?order=), so it needs the saved samples at runtime
    "/": ["./results/o*.json", "./data/catalog.json", "./data/contractors.json"],
    "/results": ["./results/eval.json", "./data/contractors.json"],
  },
};

const postHogApiKey = process.env.POSTHOG_API_KEY;
const postHogProjectId = process.env.POSTHOG_PROJECT_ID;

export default postHogApiKey && postHogProjectId
  ? withPostHogConfig(nextConfig, {
      personalApiKey: postHogApiKey,
      projectId: postHogProjectId,
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        deleteAfterUpload: true,
      },
    })
  : nextConfig;
