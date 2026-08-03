"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { pb } from "@/lib/pb";
import { applyChange, newRecordId } from "@/lib/sync";
import { attachImages } from "@/lib/noteImages";
import { metaGet, metaDelete, blobGet, blobDelete } from "@/lib/offlineDb";
import { PENDING_SHARE_KEY } from "@/lib/syncTag";
import { useToastStore } from "@/store/useToastStore";

// Web Share Target (Android): andere Apps teilen Text/Links/Bilder hierher
// (siehe share_target in public/manifest.json).
//
// Zwei Wege führen hierher:
//   - POST /share-target: vom Service Worker abgefangen, Payload in IndexedDB
//     geparkt, Redirect auf /share?shared=1. Das ist der Weg für Fotos, denn
//     einen Multipart-Body kann diese Client-Seite nicht selbst lesen.
//   - GET /share?title=…&text=…: der alte Weg. Bleibt bestehen, damit ein noch
//     nicht aktualisierter Service Worker (oder ein Direktaufruf) nicht ins
//     Leere läuft.
//
// Angelegt wird in beiden Fällen über den normalen Schreibpfad
// (applyChange → Sync-Queue), funktioniert also auch offline.

interface PendingShare {
  title: string;
  text: string;
  url: string;
  images: { key: string; type: string; name: string }[];
}

async function readPendingShare(): Promise<PendingShare | null> {
  const raw = await metaGet(PENDING_SHARE_KEY).catch(() => undefined);
  if (!raw) return null;
  // Consume it immediately: a reload must not create the note a second time.
  await metaDelete(PENDING_SHARE_KEY).catch(() => {});
  try {
    const parsed = JSON.parse(raw) as Partial<PendingShare>;
    return {
      title: String(parsed.title || ""),
      text: String(parsed.text || ""),
      url: String(parsed.url || ""),
      images: Array.isArray(parsed.images) ? parsed.images : [],
    };
  } catch {
    return null;
  }
}

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
      const pending = params.get("shared") ? await readPendingShare() : null;

      const title = (pending?.title ?? params.get("title") ?? "").trim();
      const content = [
        pending ? pending.text : params.get("text"),
        pending ? pending.url : params.get("url"),
      ]
        .map((s) => (s || "").trim())
        .filter(Boolean)
        .join("\n");

      const sharedImages = pending?.images ?? [];

      if (title || content || sharedImages.length > 0) {
        const user = pb.authStore.model || pb.authStore.record;
        try {
          const note = await applyChange({
            collection: "notes",
            action: "create",
            id: newRecordId(),
            data: {
              title,
              content: content || (sharedImages.length > 0 ? "" : title),
              type: "text",
              color: "white",
              owner: user?.id,
            },
          });

          // Shared photos arrive as raw camera files — run them through the
          // same downscale/re-encode path as the in-app picker instead of
          // uploading 12 MB straight from the gallery.
          if (sharedImages.length > 0) {
            const files: File[] = [];
            for (const image of sharedImages) {
              const blob = await blobGet(image.key).catch(() => undefined);
              if (blob) files.push(new File([blob], image.name || "shared", { type: image.type }));
              await blobDelete(image.key).catch(() => {});
            }
            if (files.length > 0) await attachImages(note.id, files, 0);
          }

          useToastStore.getState().showToast({
            message:
              sharedImages.length > 0
                ? `${sharedImages.length} Bild${sharedImages.length === 1 ? "" : "er"} als Notiz gespeichert`
                : "Geteilter Inhalt als Notiz gespeichert",
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
