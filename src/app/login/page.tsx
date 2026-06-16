"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pb";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, NotebookPen, AlertCircle, ArrowRight, CheckCircle } from "lucide-react";

const ALLOWED_EMAILS = [
  "badesebastian@outlook.com",
  "claudiaborg@web.de",
  "eztokk@gmail.com",
  "annaklatsche83@gmail.com",
];

type Mode = "login" | "register";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setSuccess("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const authData = await pb.collection("users").authWithPassword(email, password);

      document.cookie = `pb_auth=${encodeURIComponent(JSON.stringify({
        token: authData.token,
        model: authData.record
      }))}; path=/; max-age=864000; SameSite=Lax`;

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

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const normalizedEmail = email.trim().toLowerCase();

    if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
      setError("Diese E-Mail-Adresse ist nicht für die Registrierung zugelassen.");
      setIsLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwörter stimmen nicht überein.");
      setIsLoading(false);
      return;
    }

    if (password.length < 8) {
      setError("Das Passwort muss mindestens 8 Zeichen lang sein.");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password, passwordConfirm: confirmPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Registrierung fehlgeschlagen.");
        return;
      }

      setSuccess("Konto erstellt! Du kannst dich jetzt anmelden.");
      setPassword("");
      setConfirmPassword("");
      setTimeout(() => switchMode("login"), 2000);
    } catch {
      setError("Registrierung fehlgeschlagen. Bitte versuche es erneut.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--background)] via-[var(--background)] to-[var(--primary-light)] px-4 py-12 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full glass rounded-3xl p-6 sm:p-8 md:p-10 shadow-[var(--shadow-elevated)] relative z-10 border border-[var(--border-color)]"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-white mb-4 shadow-[var(--shadow-elevated)]"
            style={{ backgroundImage: "var(--fab-gradient)" }}
          >
            <NotebookPen className="w-8 h-8" />
          </motion.div>
          <h1 className="text-3xl font-extrabold text-center tracking-tight text-[var(--text-primary)]">
            Notiz PWA
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2 text-center">
            Geschlossenes System für eingeladene Personen
          </p>
        </div>

        {/* Mode Tabs */}
        <div className="flex rounded-2xl bg-[var(--background)]/40 border border-[var(--border-color)] p-1 mb-6">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                mode === m
                  ? "bg-[var(--primary-strong)] text-white shadow"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {m === "login" ? "Anmelden" : "Registrieren"}
            </button>
          ))}
        </div>

        {/* Feedback messages */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-2xl mb-6 text-sm flex items-start gap-2.5"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}
          {success && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-green-500/10 border border-green-500/20 text-green-500 px-4 py-3 rounded-2xl mb-6 text-sm flex items-start gap-2.5"
            >
              <CheckCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Forms */}
        <AnimatePresence mode="wait">
          {mode === "login" ? (
            <motion.form
              key="login"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleLogin}
              className="space-y-6"
            >
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
                    className="w-full pl-12 pr-4 py-3.5 bg-[var(--background)]/50 border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-[var(--text-primary)] text-base"
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
                className="w-full bg-[var(--primary-strong)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 px-4 rounded-2xl transition-all shadow-[var(--shadow-elevated)] flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-8"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Wird angemeldet...</span>
                  </>
                ) : (
                  <>
                    <span>Anmelden</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </motion.button>
            </motion.form>
          ) : (
            <motion.form
              key="register"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleRegister}
              className="space-y-5"
            >
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
                    minLength={8}
                    className="w-full pl-12 pr-4 py-3.5 bg-[var(--background)]/50 border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-[var(--text-primary)] text-base"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mindestens 8 Zeichen"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-semibold text-[var(--text-secondary)]">
                  Passwort bestätigen
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-muted)]" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    className="w-full pl-12 pr-4 py-3.5 bg-[var(--background)]/50 border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-[var(--text-primary)] text-base"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                type="submit"
                disabled={isLoading}
                className="w-full bg-[var(--primary-strong)] hover:bg-[var(--primary-hover)] text-white font-bold py-4 px-4 rounded-2xl transition-all shadow-[var(--shadow-elevated)] flex items-center justify-center gap-2 text-base cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-6"
              >
                {isLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Wird registriert...</span>
                  </>
                ) : (
                  <>
                    <span>Konto erstellen</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </motion.button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
