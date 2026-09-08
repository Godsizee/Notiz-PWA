import Link from "next/link";
import { FileQuestion } from "lucide-react";

// 404 fuer unbekannte Pfade. Praktisch relevant vor allem im installierten
// PWA-Kontext: ein veralteter Share-Link oder eine alte Verknuepfung landet
// sonst auf Nexts englischer Standardseite ohne Weg zurueck in die App.
export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)] shadow-[var(--shadow-card)] flex items-center justify-center text-[var(--text-secondary)]">
        <FileQuestion className="w-6 h-6" />
      </div>
      <h1 className="text-lg font-extrabold text-[var(--text-primary)]">
        Seite nicht gefunden
      </h1>
      <p className="text-sm text-[var(--text-secondary)] max-w-xs">
        Diesen Link gibt es nicht (mehr). Vielleicht wurde die Notiz gelöscht
        oder die Adresse hat sich geändert.
      </p>
      <Link
        href="/"
        className="mt-2 px-4 py-2.5 min-h-11 inline-flex items-center rounded-xl bg-primary text-white text-sm font-bold"
      >
        Zu meinen Notizen
      </Link>
    </div>
  );
}
