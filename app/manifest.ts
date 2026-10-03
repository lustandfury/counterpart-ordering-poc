import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Counterpart — the fast lane for pro orders",
    short_name: "Counterpart",
    description: "Contractors' text messages, turned into ready-to-send lumber orders. AI matches each line to the catalog; the rep checks only what's uncertain.",
    start_url: "/",
    display: "standalone",
    background_color: "#e8e9e5",
    theme_color: "#ffca05",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
