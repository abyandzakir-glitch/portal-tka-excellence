import type { Metadata } from "next";
import { Albert_Sans, Cabin } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const cabin = Cabin({ subsets: ["latin"], variable: "--font-cabin", display: "swap" });
const albertSans = Albert_Sans({ subsets: ["latin"], variable: "--font-albert-sans", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Portal Academic Excellence", template: "%s · Portal Academic Excellence" },
  description: "Portal Academic Excellence Sekolah Talenta Juara — Developing Capable Muslim Leaders",
  icons: { icon: "/brand/web/logo-master-symbol.png" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${cabin.variable} ${albertSans.variable} h-full antialiased`}>
      <body className="min-h-full">
        <NuqsAdapter>
          <TooltipProvider>{children}</TooltipProvider>
        </NuqsAdapter>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
