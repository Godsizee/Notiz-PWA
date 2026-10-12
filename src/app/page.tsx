import { Suspense } from "react";
import HomeScreen from "@/components/home/HomeScreen";

// useSearchParams (useNoteRoute) braucht auf einer vorgerenderten Seite eine
// Suspense-Grenze, sonst bricht `next build` ab. Der Fallback ist genau das,
// was vorher als erstes HTML kam (Auth-Pruefung laeuft im Client): so ist das
// precachte "/" offline nicht leer.
function SessionSplash() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[var(--background)]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest animate-pulse">
          Sitzung wird geladen...
        </p>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<SessionSplash />}>
      <HomeScreen />
    </Suspense>
  );
}
