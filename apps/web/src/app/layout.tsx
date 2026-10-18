import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "IntentLock",
  description:
    "AI-powered autonomous purchase verification. Every agent order, signed and auditable.",
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
      <body className="flex min-h-full flex-col" style={{ background: "var(--background)", color: "var(--foreground)" }}>
        <TopNav />
        <ApiHealthBanner />
        <main className="flex flex-1 flex-col">{children}</main>
        <footer className="intentlock-footer py-6 text-center text-sm">
          IntentLock — every agent order, signed and auditable.
        </footer>
      </body>
    </html>
  );
}
