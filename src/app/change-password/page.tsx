"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pb";

export default function ChangePasswordPage() {
  const [oldPassword, setOldPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== passwordConfirm) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setIsLoading(true);

    try {
      const user = pb.authStore.record;
      if (!user) throw new Error("Not logged in");

      await pb.collection("users").update(user.id, {
        oldPassword: oldPassword,
        password: password,
        passwordConfirm: passwordConfirm,
        needs_password_change: false,
      });

      // Update cookie
      const authData = await pb.collection("users").authWithPassword(user.email, password);
      document.cookie = `pb_auth=${encodeURIComponent(JSON.stringify({
        token: authData.token,
        model: authData.record
      }))}; path=/; max-age=864000; SameSite=Lax`; // 10 days

      router.push("/");
    } catch (err) {
      const error = err as Error;
      setError(error.message || "Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)] px-4">
      <div className="max-w-md w-full bg-[var(--card-bg)] rounded-2xl shadow-xl p-8 border border-[var(--border-color)]">
        <h1 className="text-2xl font-bold text-center mb-2 text-[var(--foreground)]">Change Password</h1>
        <p className="text-center text-sm text-[var(--text-secondary)] mb-6">
          For security reasons, you must change your initial password before continuing.
        </p>
        
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Current Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-[var(--background)] text-[var(--foreground)]"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              placeholder="e.g. ChangeMe123!"
            />
          </div>
          <div className="border-t border-[var(--border-color)] pt-4">
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">New Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-[var(--background)] text-[var(--foreground)]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">Confirm New Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-2 border border-[var(--border-color)] rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none bg-[var(--background)] text-[var(--foreground)]"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-colors disabled:opacity-50 mt-2"
          >
            {isLoading ? "Updating..." : "Update Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
