import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Counterpart — AI-assisted lumber ordering",
    short_name: "Counterpart",
    description: "Turn messy contractor text messages into accurate, reviewable lumber orders with AI-assisted matching.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f6f2",
    theme_color: "#ffca05",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
