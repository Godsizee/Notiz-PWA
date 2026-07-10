"use client";

import { useEffect } from "react";

// next-pwa's generated service worker calls skipWaiting(), so a new SW takes
// control silently in the background after a deploy. Without this, an
// already-open/resumed tab keeps running the old JS bundle, which can fail
// to load chunks the new deploy removed — the page gets stuck on its initial
// loading state. Reloading once on controllerchange picks up the fresh build.
export default function PwaUpdateReload() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
