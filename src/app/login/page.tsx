"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pb";

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
      
      // Save auth state to a cookie so middleware can read it
      document.cookie = `pb_auth=${encodeURIComponent(JSON.stringify({
        token: authData.token,
        model: authData.record
      }))}; path=/; max-age=864000; SameSite=Lax`; // 10 days

      if (authData.record.needs_password_change) {
        router.push("/change-password");
      } else {
        router.push("/");
      }
    } catch (err: any) {
      setError(err.message || "Login failed. Please check your credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="max-w-md w-full bg-[var(--card-bg)] rounded-2xl shadow-xl p-8 border border-[var(--border-color)]">
        <h1 className="text-3xl font-bold text-center mb-8 text-[var(--foreground)]">Anmelden</h1>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">E-Mail Adresse</label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-[var(--background)] text-[var(--foreground)]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@beispiel.de"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">Passwort</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 border border-[var(--border-color)] rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none bg-[var(--background)] text-[var(--foreground)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl transition-colors disabled:opacity-50"
          >
            {isLoading ? "Wird angemeldet..." : "Anmelden"}
          </button>
        </form>
      </div>
    </div>
  );
}
