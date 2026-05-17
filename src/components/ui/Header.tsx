"use client";

import ThemeToggle from "./ThemeToggle";
import { pb } from "@/lib/pb";
import { LogOut, Layout } from "lucide-react";
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
    // Cookie clearing is also handled by pb.ts onChange trigger, but explicit clear is extra safe
    document.cookie = "pb_auth=; path=/; max-age=0; SameSite=Lax";
    router.push("/login");
  };

  const getInitials = (email: string) => {
    if (!email) return "?";
    return email[0].toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--background)]/75 backdrop-blur-xl border-b border-[var(--border-color)] mb-6 transition-all duration-300">
      <div className="flex items-center justify-between px-4 md:px-6 h-16 max-w-4xl mx-auto">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <motion.div 
            whileHover={{ scale: 1.05, rotate: -3 }}
            whileTap={{ scale: 0.95 }}
            className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary border border-primary/15"
          >
            <Layout className="w-5.5 h-5.5" />
          </motion.div>
          <div>
            <h1 className="text-lg font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
              Notiz PWA
            </h1>
            {userEmail && (
              <p className="text-[10px] font-bold text-[var(--text-muted)] tracking-wider uppercase -mt-0.5">
                Gemeinsamer Workspace
              </p>
            )}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center gap-3">
          {/* User Profile Avatar */}
          {userEmail && (
            <motion.div 
              whileHover={{ scale: 1.05 }}
              className="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-purple-500 text-white flex items-center justify-center text-sm font-bold shadow-md cursor-help border border-white/10"
              title={userEmail}
            >
              {getInitials(userEmail)}
            </motion.div>
          )}

          <div className="h-4 w-[1px] bg-[var(--border-color)] mx-0.5"></div>

          <ThemeToggle />
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)] shadow-sm hover:shadow-md flex items-center justify-center text-red-500 hover:bg-red-500/5 transition-all cursor-pointer"
            title="Abmelden"
          >
            <LogOut className="w-4.5 h-4.5" />
          </motion.button>
        </div>
      </div>
    </header>
  );
}
