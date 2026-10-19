import { Metadata, Viewport } from "next";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import AppShell from "@/components/AppShell";
import { ToastContainer } from "@/shared/presentation/components/ToastContainer";
import { QueryProvider } from "@/shared/providers/QueryProvider";
import { ProviderProps } from "@/shared/types";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sepilo | Your secured PayPal agent",
  description:
    "Sepilo is your secured PayPal agent: it shops real stores within your spending rules and checks every order before PayPal pays.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

const THEME_INIT = `try{var t=localStorage.getItem("il-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: ProviderProps) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full font-sans bg-canvas text-fg flex">
        <QueryProvider>
          <AppShell>{children}</AppShell>
          <ToastContainer />
        </QueryProvider>
      </body>
    </html>
  );
}
