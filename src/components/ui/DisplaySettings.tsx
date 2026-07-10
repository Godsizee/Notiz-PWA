"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, LayoutGrid, List, FileJson, FileText, Download } from "lucide-react";
import { usePreferencesStore, type FontSize, type ViewMode } from "@/store/usePreferencesStore";
import { exportNotes, type ExportFormat } from "@/lib/exportNotes";
import { useToastStore } from "@/store/useToastStore";
import { hapticLight } from "@/lib/haptics";

const FONT_OPTIONS: { id: FontSize; label: string }[] = [
  { id: "sm", label: "S" },
  { id: "md", label: "M" },
  { id: "lg", label: "L" },
];

const VIEW_OPTIONS: { id: ViewMode; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "grid", label: "Raster", Icon: LayoutGrid },
  { id: "list", label: "Liste", Icon: List },
];

export default function DisplaySettings() {
  const [open, setOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const viewMode = usePreferencesStore((s) => s.viewMode);
  const fontSize = usePreferencesStore((s) => s.fontSize);
  const setViewMode = usePreferencesStore((s) => s.setViewMode);
  const setFontSize = usePreferencesStore((s) => s.setFontSize);
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
        className={`w-9 h-9 rounded-xl border shadow-sm flex items-center justify-center transition-all cursor-pointer ${
          open
            ? "bg-primary/10 border-primary/30 text-primary"
            : "bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-secondary)] hover:shadow-md"
        }`}
        title="Anzeige-Einstellungen"
        aria-label="Anzeige-Einstellungen"
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
              className="absolute right-0 top-11 z-50 w-56 rounded-2xl surface p-3 shadow-[var(--shadow-elevated)]"
            >
              {/* Font size */}
              <p className="text-[10px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 pl-1">
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
                      className={`flex-1 py-1.5 rounded-xl font-bold transition-colors cursor-pointer border ${
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
              <p className="text-[10px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 pl-1">
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
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border ${
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

              {/* Backup / Export */}
              <p className="text-[10px] font-extrabold text-[var(--text-muted)] tracking-widest uppercase mb-2 mt-3 pl-1 flex items-center gap-1">
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
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer border text-[var(--text-secondary)] border-[var(--border-color)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
