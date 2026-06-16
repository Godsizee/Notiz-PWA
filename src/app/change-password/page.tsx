"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pb";
import { motion } from "framer-motion";
import { KeyRound, Lock, AlertCircle, Save, Check } from "lucide-react";

export default function ChangePasswordPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("Die neuen Passwörter stimmen nicht überein.");
      return;
    }

    if (password.length < 8) {
      setError("Das neue Passwort muss mindestens 8 Zeichen lang sein.");
      return;
    }

    setIsLoading(true);

    try {
      const user = pb.authStore.model || pb.authStore.record;
      if (!user) throw new Error("Keine aktive Sitzung gefunden. Bitte melde dich erneut an.");

      // 1. Update password and reset needs_password_change flag
      await pb.collection("users").update(user.id, {
        oldPassword: oldPassword,
        password: password,
        passwordConfirm: passwordConfirm,
        needs_password_change: false,
      });

      setSuccess(true);

      // 2. Re-authenticate to obtain a fresh token with updated model state
      const authData = await pb.collection("users").authWithPassword(user.email, password);
      
      // 3. Write fresh cookie (will also be handled by pb.ts onChange sync, but doing explicitly for assurance)
      document.cookie = `pb_auth=${encodeURIComponent(JSON.stringify({
        token: authData.token,
        model: authData.record
      }))}; path=/; max-age=864000; SameSite=Lax`;

      // 4. Smooth redirect after a brief display of success animation
      setTimeout(() => {
        router.push("/");
      }, 1500);
    } catch (err) {
      const error = err as Error;
      setError(error.message || "Fehler beim Ändern des Passworts. Bitte überprüfe dein aktuelles Passwort.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[var(--background)] via-[var(--background)] to-[var(--primary-light)] px-4 py-12 relative overflow-hidden">
      {/* Decorative background shapes */}
      <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] rounded-full bg-primary/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[120px] pointer-events-none" />

      <motion.div 
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md w-full glass rounded-3xl p-6 sm:p-8 md:p-10 shadow-[var(--shadow-elevated)] relative z-10 border border-[var(--border-color)]"
      >
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <motion.div 
            animate={success ? { scale: [1, 1.2, 1], rotate: 360 } : {}}
            className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 border transition-colors ${success ? 'bg-green-500/10 text-green-500 border-green-500/20' : 'bg-primary/10 text-primary border-primary/20'}`}
          >
            {success ? <Check className="w-8 h-8" /> : <KeyRound className="w-8 h-8" />}
          </motion.div>
          <h1 className="text-2xl font-extrabold text-center tracking-tight text-[var(--text-primary)]">
            {success ? "Passwort aktualisiert!" : "Passwort ändern"}
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2 text-center max-w-xs leading-relaxed">
            {success 
              ? "Dein Passwort wurde erfolgreich geändert. Du wirst weitergeleitet..."
              : "Aus Sicherheitsgründen musst du dein initiales Passwort ändern, bevor du die App nutzen kannst."
            }
          </p>
        </div>

        {/* Error State */}
        {error && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-2xl mb-5 text-sm flex items-start gap-2.5"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Change Password Form */}
        {!success && (
          <form onSubmit={handleChangePassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-[var(--text-secondary)]">
                Aktuelles Passwort
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="password"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-[var(--background)]/50 border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-[var(--text-primary)] placeholder-•••••••• text-base"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="z.B. ChangeMe123!"
                />
              </div>
            </div>

            <div className="h-[1px] bg-[var(--border-color)] my-4" />

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-[var(--text-secondary)]">
                Neues Passwort
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="password"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-[var(--background)]/50 border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-[var(--text-primary)] text-base"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mindestens 8 Zeichen"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-[var(--text-secondary)]">
                Neues Passwort bestätigen
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                <input
                  type="password"
                  required
                  className="w-full pl-11 pr-4 py-3 bg-[var(--background)]/50 border border-[var(--border-color)] rounded-2xl focus:ring-2 focus:ring-primary focus:border-transparent focus:outline-none text-[var(--text-primary)] text-base"
                  value={passwordConfirm}
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="Neues Passwort wiederholen"
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
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Speichert Passwort...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>Passwort speichern & weiter</span>
                </>
              )}
            </motion.button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
