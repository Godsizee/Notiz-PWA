"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pb";
import { applyChange, newRecordId } from "@/lib/sync";
import { useToastStore } from "@/store/useToastStore";

// Web Share Target (Android): andere Apps teilen Text/Links per GET hierher
// (siehe share_target in public/manifest.json). Der Inhalt wird über den
// normalen Schreibpfad (applyChange → Sync-Queue) als Textnotiz angelegt,
// funktioniert also auch offline.
export default function SharePage() {
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      if (!pb.authStore.isValid) {
        router.replace("/login");
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const title = (params.get("title") || "").trim();
      const content = [params.get("text"), params.get("url")]
        .map((s) => (s || "").trim())
        .filter(Boolean)
        .join("\n");

      if (title || content) {
        const user = pb.authStore.model || pb.authStore.record;
        try {
          await applyChange({
            collection: "notes",
            action: "create",
            id: newRecordId(),
            data: {
              title,
              content: content || title,
              type: "text",
              color: "white",
              owner: user?.id,
            },
          });
          useToastStore.getState().showToast({
            message: "Geteilter Inhalt als Notiz gespeichert",
            duration: 3000,
          });
        } catch (err) {
          console.error("Failed to save shared content:", err);
          useToastStore.getState().showToast({
            message: "Geteilter Inhalt konnte nicht gespeichert werden.",
            tone: "danger",
            duration: 3500,
          });
        }
      }

      router.replace("/");
    })();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest animate-pulse">
          Geteilter Inhalt wird gespeichert...
        </p>
      </div>
    </div>
  );
}
