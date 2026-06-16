"use client";

import ThemeToggle from "./ThemeToggle";
import { pb } from "@/lib/pb";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export default function Header() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    const user = pb.authStore.model || pb.authStore.record;
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, []);

  const handleLogout = () => {
    pb.authStore.clear();
    document.cookie = "pb_auth=; path=/; max-age=0; SameSite=Lax";
    router.push("/login");
  };

  const getInitials = (email: string) => {
    if (!email) return "?";
    return email[0].toUpperCase();
  };

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
                Gemeinsamer Workspace
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
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
    </header>
  );
}
