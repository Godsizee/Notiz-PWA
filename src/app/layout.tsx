import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Notiz PWA",
  description: "Shared notes and checklists",
  generator: "Next.js",
  manifest: "/manifest.json",
  keywords: ["nextjs", "pwa", "notes", "checklist"],
  authors: [{ name: "Your Name" }],
};

export const viewport: Viewport = {
  themeColor: "#f0f4f8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="mx-auto max-w-4xl relative min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
