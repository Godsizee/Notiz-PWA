"use client";

import { useEffect } from "react";

// Android Chrome largely ignores the manifest's "fullscreen" display mode for
// installed PWAs and falls back to "standalone" (status bar still visible).
// Requesting the Fullscreen API ourselves actually hides it — but browsers
// require a user gesture to grant that, so we request it on the first tap
// instead of on load.
export default function PwaFullscreen() {
  useEffect(() => {
    if (!document.documentElement.requestFullscreen) return;

    const isInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches;
    if (!isInstalled) return;

    const enterFullscreen = () => {
      if (document.fullscreenElement) return;
      document.documentElement.requestFullscreen().catch(() => {});
    };

    enterFullscreen();
    document.addEventListener("pointerdown", enterFullscreen, { once: true });
    return () => document.removeEventListener("pointerdown", enterFullscreen);
  }, []);

  return null;
}
