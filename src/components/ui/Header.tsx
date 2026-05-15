"use client";

import ThemeToggle from "./ThemeToggle";
import { pb } from "@/lib/pb";
import { LogOut, Layout } from "lucide-react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function Header() {
  const router = useRouter();

  const handleLogout = () => {
    pb.authStore.clear();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border mb-6">
      <div className="flex items-center justify-between px-4 h-16 max-w-4xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
            <Layout className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
            Notiz PWA
          </h1>
        </div>
        
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={handleLogout}
            className="p-2 rounded-xl bg-card border border-border shadow-sm flex items-center justify-center text-red-500"
            title="Abmelden"
          >
            <LogOut className="w-5 h-5" />
          </motion.button>
        </div>
      </div>
    </header>
  );
}
