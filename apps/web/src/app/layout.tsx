import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import TopNav from "@/components/TopNav";
import ApiHealthBanner from "@/components/ApiHealthBanner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IntentLock | Autonomous Purchase Verification Gateway",
  description:
    "AI-powered autonomous purchase verification layer. Real-time prompt injection scanning, semantic intent diffing, and cryptographic proof of intent for AI shopping agents.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans bg-[var(--color-bg)] text-[var(--color-text)]">
        <TopNav />
        <ApiHealthBanner />
        <main className="flex flex-1 flex-col">{children}</main>
        
        <footer className="border-t border-slate-200/80 bg-white/50 py-8 text-xs text-slate-500 backdrop-blur-xs dark:border-slate-800/80 dark:bg-slate-950/40 dark:text-slate-400">
          <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 dark:text-slate-200">IntentLock</span>
              <span>—</span>
              <span>Semantic purchase verification for autonomous AI shopping agents</span>
            </div>
            <div className="flex items-center gap-6">
              <Link href="/lab" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Attack Lab
              </Link>
              <Link href="/wallet" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Wallet Console
              </Link>
              <Link href="/store/freshmart" className="hover:text-slate-900 dark:hover:text-white transition-colors">
                Demo Stores
              </Link>
              <a
                href="https://github.com/BrienAustinClayton/intentlock"
                target="_blank"
                rel="noreferrer"
                className="hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                GitHub
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
