"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, LayoutGrid, List, FileJson, FileText, Download, Sun, Moon, MoonStar, LogOut } from "lucide-react";
import { usePreferencesStore, type FontSize, type SortMode, type ViewMode } from "@/store/usePreferencesStore";
import { exportNotes, type ExportFormat } from "@/lib/exportNotes";
import { useToastStore } from "@/store/useToastStore";
import { hapticLight } from "@/lib/haptics";
import { applyTheme, readTheme, type Theme } from "@/lib/theme";

const FONT_OPTIONS: { id: FontSize; label: string }[] = [
  { id: "sm", label: "S" },
  { id: "md", label: "M" },
  { id: "lg", label: "L" },
];

const VIEW_OPTIONS: { id: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "grid", label: "Raster", Icon: LayoutGrid },
  { id: "list", label: "Liste", Icon: List },
];

const SORT_OPTIONS: { id: SortMode; label: string }[] = [
  { id: "server", label: "Standard" },
  { id: "title", label: "Titel A–Z" },
];

const THEME_OPTIONS: { id: Theme; label: string; Icon: typeof Sun }[] = [
  { id: "light", label: "Hell", Icon: Sun },
  { id: "dark", label: "Dunkel", Icon: Moon },
  { id: "amoled", label: "Schwarz", Icon: MoonStar },
];

function DesignSection() {
  const [theme, setTheme] = useState<Theme>("light");
  // Das No-Flash-Skript (layout.tsx) hat die Klassen schon gesetzt — ablesen,
  // damit die Auswahl zur Seite passt.
  useEffect(() => {
    setTheme(readTheme());
  }, []);

  return (
    <>
      <p className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 pl-1">
        Design
      </p>
      <div className="flex gap-1.5 mb-3" role="radiogroup" aria-label="Design">
        {THEME_OPTIONS.map(({ id, label, Icon }) => {
          const active = theme === id;
          return (
            <button
              key={id}
              role="radio"
              aria-checked={active}
              onClick={() => {
                hapticLight();
                applyTheme(id);
                setTheme(id);
              }}
              className={`flex-1 flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                active
                  ? "bg-primary-strong text-white border-transparent"
                  : "text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}

interface DisplaySettingsProps {
  userEmail: string;
  onLogout: () => void;
}

export default function DisplaySettings({ userEmail, onLogout }: DisplaySettingsProps) {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const viewMode = usePreferencesStore((s) => s.viewMode);
  const fontSize = usePreferencesStore((s) => s.fontSize);
  const sortMode = usePreferencesStore((s) => s.sortMode);
  const setViewMode = usePreferencesStore((s) => s.setViewMode);
  const setFontSize = usePreferencesStore((s) => s.setFontSize);
  const setSortMode = usePreferencesStore((s) => s.setSortMode);
  const showToast = useToastStore((s) => s.showToast);

  const handleExport = async (format: ExportFormat) => {
    if (isExporting) return;
    hapticLight();
    setIsExporting(true);
    try {
      const count = await exportNotes(format);
      showToast({
        message: `${count} Notiz${count === 1 ? "" : "en"} exportiert`,
        duration: 3000,
      });
    } catch (err) {
      console.error("Failed to export notes:", err);
      showToast({ message: "Export fehlgeschlagen.", tone: "danger", duration: 3500 });
    } finally {
      setIsExporting(false);
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setOpen((v) => !v)}
        className={`tap-target rounded-full border transition-colors cursor-pointer ${
          open
            ? "bg-primary/10 border-primary/30 text-primary"
            : "border-transparent text-[var(--text-secondary)] hover:bg-[var(--text-primary)]/5"
        }`}
        title="Menü"
        aria-label="Menü"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal className="w-4.5 h-4.5" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
            {/* Click-outside backdrop */}
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.16 }}
              className="absolute right-0 top-12 z-50 w-64 rounded-2xl surface p-3 shadow-[var(--shadow-elevated)]"
            >
              <DesignSection />

              {/* Font size */}
              <p className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 pl-1">
                Textgröße
              </p>
              <div className="flex gap-1.5 mb-3">
                {FONT_OPTIONS.map((f) => {
                  const active = fontSize === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => {
                        hapticLight();
                        setFontSize(f.id);
                      }}
                      className={`flex-1 min-h-10 rounded-xl font-bold transition-colors cursor-pointer border ${
                        active
                          ? "bg-primary-strong text-white border-transparent"
                          : "text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {f.label}
                    </button>
                  );
                })}
              </div>

              {/* View mode */}
              <p className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 pl-1">
                Ansicht
              </p>
              <div className="flex gap-1.5">
                {VIEW_OPTIONS.map(({ id, label, Icon }) => {
                  const active = viewMode === id;
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        hapticLight();
                        setViewMode(id);
                      }}
                      className={`flex-1 flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                        active
                          ? "bg-primary-strong text-white border-transparent"
                          : "text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Sortierung (Datumssortierung braeuchte created/updated in der Datenbank) */}
              <p className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 mt-3 pl-1">
                Sortieren
              </p>
              <div className="flex gap-1.5" role="radiogroup" aria-label="Sortieren">
                {SORT_OPTIONS.map(({ id, label }) => {
                  const active = sortMode === id;
                  return (
                    <button
                      key={id}
                      role="radio"
                      aria-checked={active}
                      onClick={() => {
                        hapticLight();
                        setSortMode(id);
                      }}
                      className={`flex-1 flex min-h-10 items-center justify-center rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
                        active
                          ? "bg-primary-strong text-white border-transparent"
                          : "text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Backup / Export */}
              <p className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 mt-3 pl-1 flex items-center gap-1">
                <Download className="w-3 h-3" />
                Backup
              </p>
              <div className="flex gap-1.5">
                {(
                  [
                    { id: "json", label: "JSON", Icon: FileJson },
                    { id: "markdown", label: "Markdown", Icon: FileText },
                  ] as { id: ExportFormat; label: string; Icon: typeof FileJson }[]
                ).map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => handleExport(id)}
                    disabled={isExporting}
                    className="flex-1 flex min-h-10 items-center justify-center gap-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Account */}
              <div className="mt-3 border-t border-[var(--border-color)] pt-3">
                <p className="text-[11px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 pl-1">
                  Konto
                </p>
                {userEmail && (
                  <p className="mb-2 truncate pl-1 text-sm text-[var(--text-secondary)]" title={userEmail}>
                    {userEmail}
                  </p>
                )}
                <button
                  onClick={() => {
                    setOpen(false);
                    onLogout();
                  }}
                  className="flex w-full min-h-10 items-center justify-center gap-2 rounded-xl border border-[var(--border-color)] text-sm font-bold text-red-500 transition-colors hover:bg-red-500/10 cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Abmelden
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
