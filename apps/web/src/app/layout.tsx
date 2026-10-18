import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import TopHeader from "@/components/TopHeader";
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full font-sans bg-[#0c0d12] text-gray-100 flex">
        {/* Persistent Left Sidebar */}
        <Sidebar />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 pl-64 min-h-screen">
          <TopHeader />
          <ApiHealthBanner />
          <main className="flex-1 p-6 sm:p-8 max-w-7xl w-full mx-auto">
            {children}
          </main>
          
          <footer className="border-t border-[#1c1f28] py-4 px-8 text-xs text-gray-500 flex items-center justify-between">
            <span>© 2026 IntentLock Gateway · Ed25519 & Channel3 Active</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Engine Healthy</span>
              </span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
