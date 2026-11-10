import type { Metadata } from "next";
import { Cormorant_Garamond, Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { PrefsProvider } from "@/lib/prefs";
import { ToastProvider } from "./components/ui";
import { Shell } from "./components/Shell";

/* Self-hosted by Next at build time: no external CSS/font requests at runtime. */
const playfair = Playfair_Display({
  subsets: ["latin"], weight: ["600", "700"], variable: "--font-playfair", display: "swap",
});
const cormorant = Cormorant_Garamond({
  subsets: ["latin"], weight: ["600", "700"], variable: "--font-cormorant", display: "swap",
});
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"], weight: ["400", "500"], variable: "--font-jetbrains", display: "swap",
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
