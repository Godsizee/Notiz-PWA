"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, MoonStar } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { syncThemeColor } from "@/lib/themeColor";

type Theme = "light" | "dark" | "amoled";

// Zyklus Hell → Dunkel → True Black (AMOLED); das Icon zeigt jeweils das
// Theme an, zu dem der nächste Tap wechselt.
const NEXT: Record<Theme, Theme> = { light: "dark", dark: "amoled", amoled: "light" };

const NEXT_ICON: Record<Theme, { Icon: typeof Sun; label: string }> = {
  light: { Icon: Moon, label: "Dunkles Design" },
  dark: { Icon: MoonStar, label: "True-Black-Design (AMOLED)" },
  amoled: { Icon: Sun, label: "Helles Design" },
};

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    // The no-flash script in layout.tsx already set the classes on <html>.
    // Mirror that as our source of truth so the icon matches the page.
    const root = document.documentElement;
    setTheme(
      root.classList.contains("amoled") ? "amoled" : root.classList.contains("dark") ? "dark" : "light"
    );
  }, []);

  const cycleTheme = () => {
    const newTheme = NEXT[theme];
    setTheme(newTheme);
    localStorage.setItem("theme", newTheme);
    const root = document.documentElement;
    root.classList.remove("light", "dark", "amoled");
    if (newTheme === "amoled") {
      root.classList.add("dark", "amoled");
    } else {
      root.classList.add(newTheme);
    }
    syncThemeColor();
  };

  const { Icon, label } = NEXT_ICON[theme];

  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={cycleTheme}
      className="relative w-9 h-9 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] shadow-sm flex items-center justify-center text-[var(--primary)] overflow-hidden cursor-pointer"
      aria-label="Design umschalten"
      title={label}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={theme}
          initial={{ y: 14, opacity: 0, rotate: -30 }}
          animate={{ y: 0, opacity: 1, rotate: 0 }}
          exit={{ y: -14, opacity: 0, rotate: 30 }}
          transition={{ duration: 0.2 }}
        >
          <Icon className="w-[18px] h-[18px]" />
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
