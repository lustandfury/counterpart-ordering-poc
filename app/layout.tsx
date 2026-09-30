import type { Metadata, Viewport } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/lib/theme";
import { AccessProvider } from "@/components/AccessProvider";

const dmSans = DM_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`${dmSans.variable} ${geistMono.variable} h-full antialiased`}
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
