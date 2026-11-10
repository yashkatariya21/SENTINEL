import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { PrefsProvider } from "@/lib/prefs";
import { ToastProvider } from "./components/ui";
import { Shell } from "./components/Shell";

/* Fonts are committed in ./fonts and self-hosted from the app origin.
 *
 * This used to be `next/font/google`, which downloads the files from Google during
 * `next build`. That made the build depend on network access and on Google's CSS
 * service answering — when it did not, the build died with "An error occurred in
 * next/font" and nothing could be shipped. Local files build offline, in CI, and in a
 * container with no egress, and the browser still makes no third-party requests.
 * Licences: app/fonts/OFL-NOTICE.md (SIL Open Font License 1.1).
 */
const playfair = localFont({
  src: [
    { path: "./fonts/playfair-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/playfair-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-playfair", display: "swap", preload: true,
});
const cormorant = localFont({
  src: [
    { path: "./fonts/cormorant-600.woff2", weight: "600", style: "normal" },
    { path: "./fonts/cormorant-700.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-cormorant", display: "swap", preload: true,
});
const inter = localFont({
  src: [{ path: "./fonts/inter-var.woff2", weight: "100 900", style: "normal" }],
  variable: "--font-inter", display: "swap", preload: true,
});
const jetbrains = localFont({
  src: [
    { path: "./fonts/jetbrains-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/jetbrains-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-jetbrains", display: "swap", preload: false,
});

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://sentinel-ai.example";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: "Sentinel AI — every word, approved",
  description:
    "Six specialist reviewers check content against the Brand Kit. Every finding cites its rule and evidence. Humans decide.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "Sentinel AI — every word, approved",
    description:
      "Six specialist reviewers read each draft against your Brand Kit. Every finding quotes the rule, shows its source, and waits for a human.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Sentinel AI — every word, approved" }],
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${cormorant.variable} ${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-paper font-sans text-ink antialiased">
        <a href="#main" className="skip-link">Skip to main content</a>
        <PrefsProvider>
          <AuthProvider>
            <ToastProvider>
              <Shell>{children}</Shell>
            </ToastProvider>
          </AuthProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
