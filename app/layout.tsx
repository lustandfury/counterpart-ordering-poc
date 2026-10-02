import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";
import { AccessProvider } from "@/components/AccessProvider";

// One family for everything. Its width axis gives the condensed figures (the `figures` utility) for quantities and prices.
const archivo = Archivo({
  variable: "--font-ui",
  subsets: ["latin"],
  axes: ["wdth"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://counterpart-ordering-poc.vercel.app"),
  title: {
    default: "Counterpart — AI-assisted lumber ordering",
    template: "%s · Counterpart",
  },
  description: "Turn messy contractor text messages into accurate, reviewable lumber orders with AI-assisted matching.",
  applicationName: "Counterpart",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_CA",
    url: "/",
    siteName: "Counterpart",
    title: "Counterpart — AI-assisted lumber ordering",
    description: "Turn messy contractor text messages into accurate, reviewable lumber orders with AI-assisted matching.",
    images: [{ url: "/images/counterpart-og.png", width: 1730, height: 909, alt: "Counterpart AI-assisted lumber ordering" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Counterpart — AI-assisted lumber ordering",
    description: "Turn messy contractor text messages into accurate, reviewable lumber orders with AI-assisted matching.",
    images: ["/images/counterpart-og.png"],
  },
  // icons come from app/favicon.ico, app/icon.svg and app/apple-icon.png (see scripts/generate-icons.ts)
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#ffca05",
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${archivo.variable} h-full antialiased`}
    >
      <head>
        <link rel="preload" as="image" href="/images/lock-bg.jpg" />
        {/* apply the saved theme before first paint, so there is no flash of the wrong one */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col"><AccessProvider>{children}</AccessProvider></body>
    </html>
  );
}
