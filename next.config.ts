import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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

export default nextConfig;
