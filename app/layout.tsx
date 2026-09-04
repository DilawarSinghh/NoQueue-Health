import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Scriba — Fast, friendly hospital intake",
  description:
    "Replace slow hospital paperwork with an AI-guided conversational intake, ending in a doctor-ready PDF.",
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
        {/* Soft pale blue → white gradient background, subtle per spec §5 */}
        <div className="min-h-dvh bg-gradient-to-b from-sky-100 via-white to-teal-50">
          {children}
        </div>
      </body>
    </html>
  );
}
