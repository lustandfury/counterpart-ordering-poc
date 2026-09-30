import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // the dev-mode badge sits on top of the sidebar's composer
  devIndicators: false,
  // the live-run route reads the catalog and house rules at request time
  outputFileTracingIncludes: { "/api/run": ["./data/catalog.json", "./data/house-defaults.md"] },
};

export default nextConfig;
