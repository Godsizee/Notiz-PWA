import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { SerwistProvider } from "@serwist/turbopack/react";
import "./globals.css";
import PwaUpdateReload from "@/components/PwaUpdateReload";
import MotionProvider from "@/components/MotionProvider";

// Selbst gehostet: next/font laedt die Dateien zur Buildzeit und liefert sie
// von der eigenen Origin aus. Der fruehere @import von fonts.googleapis.com in
// globals.css wurde von der eigenen CSP (style-src 'self') blockiert — die App
// lief in Produktion also nie in Outfit, und offline erst recht nicht.
const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-outfit",
});

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
  // Chrome/Android verkleinert mit der Tastatur den Layout-Viewport, statt sie
  // ueber die Seite zu legen — so bleiben sticky Leisten (NoteBottomBar) sichtbar.
  // iOS ignoriert das; dort hilft useKeyboardInset.
  interactiveWidget: "resizes-content",
  // Kein maximumScale/userScalable mehr: eine Zoomsperre verstoesst gegen
  // WCAG 1.4.4. Eingabefelder haben mind. 16 px, damit iOS beim Fokussieren
  // nicht von selbst zoomt; Doppeltipp-Zoom auf Knoepfen verhindert bereits
  // `touch-action: manipulation` in globals.css.
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
    <html lang="de" className={`scroll-smooth ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased safe-x">
        {/* reloadOnOnline aus: ein erzwungener Reload bei Netzrueckkehr wirft
            einen offenen Editor weg — Realtime und Offline-Queue erledigen den
            Wiederanlauf ohnehin. Im Dev-Modus kein SW, wie bisher. */}
        <SerwistProvider
          swUrl="/serwist/sw.js"
          disable={process.env.NODE_ENV === "development"}
          reloadOnOnline={false}
        >
          <MotionProvider>
            <PwaUpdateReload />
            <div className="relative min-h-screen">
              {children}
            </div>
          </MotionProvider>
        </SerwistProvider>
      </body>
    </html>
  );
}
