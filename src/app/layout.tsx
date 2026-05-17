import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Notiz PWA",
  description: "Schlanke, performante Notiz- und Einkaufszettel-App für 2 Personen",
  generator: "Next.js",
  manifest: "/manifest.json",
  keywords: ["nextjs", "pwa", "notes", "checklist", "shoppinglist", "keep"],
  authors: [{ name: "Notiz App" }],
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Notiz",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
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
    <html lang="de" className="scroll-smooth">
      <head>
        {/* iOS splash icons and startup optimizations */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="antialiased">
        <div className="mx-auto max-w-4xl relative min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
