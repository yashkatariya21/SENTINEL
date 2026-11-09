import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "./components/ui";
import { Shell } from "./components/Shell";

export const metadata: Metadata = {
  title: "Sentinel AI — brand governance before publication",
  description:
    "Six specialist reviewers check content against the Brand Kit. Every finding cites its rule and evidence. Humans decide.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <a href="#main" className="skip-link">Skip to main content</a>
        <AuthProvider>
          <ToastProvider>
            <Shell>{children}</Shell>
          </ToastProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
