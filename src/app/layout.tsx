import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaUpdateReload from "@/components/PwaUpdateReload";
import PwaFullscreen from "@/components/PwaFullscreen";

export const metadata: Metadata = {
  title: "B&B Notes",
  description: "Geteilte Notizen und Checklisten für zwei",
  generator: "Next.js",
  manifest: "/manifest.json",
  keywords: ["nextjs", "pwa", "notes", "checklist", "shoppinglist", "keep"],
  authors: [{ name: "B&B Notes" }],
  icons: {
    apple: "/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "B&B Notes",
  },
};

export const viewport: Viewport = {
  // theme-color is managed dynamically (see themeScript + lib/themeColor.ts)
  // so the status bar follows the active theme and the opened note's color.
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Set theme, font size and status-bar color before first paint to avoid flashes.
const themeScript = `
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('theme');
    var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    theme = saved || (prefersDark ? 'dark' : 'light');
    if (theme === 'amoled') {
      document.documentElement.classList.add('dark', 'amoled');
    } else {
      document.documentElement.classList.add(theme);
    }

    var fs = localStorage.getItem('fontSize');
    document.documentElement.style.fontSize =
      fs === 'sm' ? '87.5%' : fs === 'lg' ? '112.5%' : '100%';
  } catch (e) {
    document.documentElement.classList.add('light');
  }
  var meta = document.createElement('meta');
  meta.setAttribute('name', 'theme-color');
  meta.id = 'theme-color-dynamic';
  meta.setAttribute('content', theme === 'amoled' ? '#000000' : theme === 'dark' ? '#0b0717' : '#390099');
  document.head.appendChild(meta);
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="de" className="scroll-smooth" suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased safe-x">
        <PwaUpdateReload />
        <PwaFullscreen />
        <div className="mx-auto max-w-4xl relative min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
