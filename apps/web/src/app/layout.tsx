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
        
        <footer className="border-t border-gray-200 py-6 dark:border-gray-800">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <span className="text-xs text-gray-400">
              © 2026 IntentLock
            </span>
            <div className="flex items-center gap-5">
              <Link href="/lab" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Lab
              </Link>
              <Link href="/wallet" className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                Wallet
              </Link>
              <a
                href="https://github.com/BrienAustinClayton/intentlock"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
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
