import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { SiteAssistant } from "@/components/SiteAssistant";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "NoQueue Health — Hospital documentation, made simple",
  description:
    "A two-sided marketplace connecting hospital documentation agents with patients, plus an AI-powered self-serve intake flow.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4FB3BF",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans leading-relaxed`}>
        {/* Soft pale blue → white gradient background */}
        <div className="min-h-dvh bg-gradient-to-b from-sky-100 via-white to-teal-50">
          {children}
        </div>
        {/* Site-wide assistant widget — appears on every page for both roles */}
        <SiteAssistant />
      </body>
    </html>
  );
}
