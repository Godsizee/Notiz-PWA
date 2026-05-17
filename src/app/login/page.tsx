"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pb";
import { motion } from "framer-motion";
import { Mail, Lock, Layout, AlertCircle, ArrowRight } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const authData = await pb.collection("users").authWithPassword(email, password);
      
      // Save auth state to a cookie so middleware can read it immediately
      document.cookie = `pb_auth=${encodeURIComponent(JSON.stringify({
        token: authData.token,
        model: authData.record
      }))}; path=/; max-age=864000; SameSite=Lax`; // 10 days

      if (authData.record.needs_password_change) {
        router.push("/change-password");
      } else {
        router.push("/");
      }
    } catch (err) {
      const error = err as Error;
      setError(error.message || "Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--background)] via-[var(--background)] to-[var(--primary-light)] px-4 py-12 relative overflow-hidden">
      {/* Decorative ambient glowing background circles */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full glass rounded-3xl p-8 md:p-10 shadow-2xl relative z-10 border border-[var(--border-color)]"
      >
        {/* Brand/Header */}
        <div className="flex flex-col items-center mb-8">
          <motion.div 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary mb-4 border border-primary/20"
          >
            <Layout className="w-8 h-8" />
          </motion.div>
          <h1 className="text-3xl font-extrabold text-center tracking-tight text-[var(--text-primary)]">
            Notiz PWA
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2 text-center">
            Geschlossenes System für exakt 2 Personen
          </p>
        </div>
        
        {/* Error Message */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-2xl mb-6 text-sm flex items-start gap-2.5"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-[var(--text-secondary)]">
              E-Mail-Adresse
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
              <input
                type="email"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-[var(--background)]/50 border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-[var(--text-primary)] placeholder-[var(--text-muted)]/50 text-base"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@beispiel.de"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-[var(--text-secondary)]">
              Passwort
            </label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
              <input
                type="password"
                required
                className="w-full pl-12 pr-4 py-3.5 bg-[var(--background)]/50 border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-[var(--text-primary)] placeholder-•••••••• text-base"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </div>

          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            type="submit"
            disabled={isLoading}
            className="w-full bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 px-4 rounded-2xl transition-all shadow-lg hover:shadow-primary/30 flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-8"
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Wird angemeldet...</span>
              </>
            ) : (
              <>
                <span>Anmelden</span>
                <ArrowRight className="w-5 h-5" />
              </>
            )}
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}
