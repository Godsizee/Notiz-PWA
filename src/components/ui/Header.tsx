"use client";

import ThemeToggle from "./ThemeToggle";
import DisplaySettings from "./DisplaySettings";
import { pb } from "@/lib/pb";
import { LogOut, Search, X, Cloud, CloudOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { initSync } from "@/lib/sync";
import { initPreferences } from "@/store/usePreferencesStore";
import { useSyncStore } from "@/store/useSyncStore";

interface HeaderProps {
  /** Controlled search value — omit both props to hide the search UI. */
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
}

export default function Header({ searchQuery = "", onSearchChange }: HeaderProps) {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isOnline = useSyncStore((s) => s.isOnline);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const pendingCount = useSyncStore((s) => s.pendingCount);

  useEffect(() => {
    initSync();
    initPreferences();
    const user = pb.authStore.model || pb.authStore.record;
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, []);

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  const handleLogout = () => {
    pb.authStore.clear();
    document.cookie = "pb_auth=; path=/; max-age=0; SameSite=Lax";
    router.push("/login");
  };

  const getInitials = (email: string) => {
    if (!email) return "?";
    return email[0].toUpperCase();
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    onSearchChange?.("");
  };

  const syncTitle = !isOnline
    ? "Offline – Änderungen werden lokal gespeichert und später synchronisiert"
    : isSyncing
      ? "Synchronisiert..."
      : pendingCount > 0
        ? `${pendingCount} Änderung${pendingCount === 1 ? "" : "en"} wartet auf Synchronisation`
        : "Online – alles synchronisiert";

  return (
    <header className="sticky top-0 z-40 w-full glass border-b border-[var(--border-color)] mb-6 safe-t">
      <div className="flex items-center justify-between gap-2 px-3 sm:px-6 h-16 max-w-4xl mx-auto">
        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <motion.div
            whileHover={{ scale: 1.05, rotate: -3 }}
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 shrink-0 rounded-xl overflow-hidden shadow-[var(--shadow-card)]"
          >
            <img src="/logo.png" alt="B&B Notes Logo" className="w-full h-full object-cover" />
          </motion.div>
          <div className="min-w-0">
            <h1 className="text-lg font-extrabold tracking-tight brand-text truncate">
              B&amp;B Notes
            </h1>
            {userEmail && (
              <p className="hidden xs:block text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase -mt-0.5 truncate">
                Meine &amp; geteilte Notizen
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          {/* Sync / offline status */}
          <div
            className="relative w-9 h-9 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] shadow-sm flex items-center justify-center cursor-help"
            title={syncTitle}
          >
            {!isOnline ? (
              <CloudOff className="w-4.5 h-4.5 text-amber-500" />
            ) : isSyncing ? (
              <RefreshCw className="w-4.5 h-4.5 text-primary animate-spin" />
            ) : (
              <Cloud className="w-4.5 h-4.5 text-[var(--text-muted)]" />
            )}
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </div>

          {/* Search toggle */}
          {onSearchChange && (
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => (isSearchOpen ? closeSearch() : setIsSearchOpen(true))}
              className={`w-9 h-9 rounded-xl border shadow-sm flex items-center justify-center transition-all cursor-pointer ${
                isSearchOpen
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-[var(--card-bg)] border-[var(--border-color)] text-[var(--text-secondary)] hover:shadow-md"
              }`}
              title="Notizen durchsuchen"
            >
              <Search className="w-4.5 h-4.5" />
            </motion.button>
          )}

          {/* User Profile Avatar — hidden on very narrow screens */}
          {userEmail && (
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="hidden xs:flex w-8 h-8 rounded-full text-white items-center justify-center text-sm font-bold shadow-md cursor-help border border-white/10"
              style={{ backgroundImage: "var(--brand-gradient)" }}
              title={userEmail}
            >
              {getInitials(userEmail)}
            </motion.div>
          )}

          <div className="hidden xs:block h-4 w-[1px] bg-[var(--border-color)] mx-0.5" />

          <DisplaySettings />

          <ThemeToggle />

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] shadow-sm hover:shadow-md flex items-center justify-center text-red-500 hover:bg-red-500/10 transition-all cursor-pointer"
            title="Abmelden"
          >
            <LogOut className="w-4.5 h-4.5" />
          </motion.button>
        </div>
      </div>

      {/* Expandable search row */}
      <AnimatePresence>
        {isSearchOpen && onSearchChange && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden max-w-4xl mx-auto"
          >
            <div className="flex items-center gap-2.5 px-4 sm:px-6 pb-3">
              <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") closeSearch();
                }}
                placeholder="Titel, Inhalt und Checklisten durchsuchen..."
                className="flex-1 bg-transparent border-none outline-none text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)]/50 py-1.5 min-w-0"
              />
              <button
                onClick={() => (searchQuery ? onSearchChange("") : closeSearch())}
                className="w-7 h-7 rounded-lg hover:bg-[var(--background)]/80 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                title={searchQuery ? "Eingabe löschen" : "Suche schließen"}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
