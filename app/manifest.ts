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
    icons: [{ src: "/favicon.ico", sizes: "16x16 32x32 256x256", type: "image/x-icon" }],
  };
}
