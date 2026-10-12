import { spawnSync } from 'node:child_process';
import { createSerwistRoute } from '@serwist/turbopack';

// Baut src/app/sw.ts beim `next build` (force-static) und liefert ihn unter
// /serwist/sw.js aus. Im Docker-Build fehlt .git (.dockerignore) — dann
// versioniert eine Zufalls-ID die Offline-Seite, was pro Build genau richtig ist.
const revision =
  spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf-8' }).stdout?.trim() || crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  // "/" precachen: Navigationen haben keinen Content-Type-Request-Header und
  // fallen sonst in Serwists "others"-Cache mit 24 h Ablauf — nach einem Tag
  // ohne Netz startete die installierte App nicht mehr (Plan UI-Overhaul B.6 #2).
  additionalPrecacheEntries: [
    { url: '/', revision },
    { url: '/~offline', revision },
  ],
  swSrc: 'src/app/sw.ts',
  useNativeEsbuild: true,
  esbuildOptions: {
    define: {
      'process.env.NEXT_PUBLIC_POCKETBASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_POCKETBASE_URL ?? ''),
    },
  },
});
