import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // These effects read from external systems (PocketBase authStore, localStorage,
      // browser APIs) to initialize state on mount — a legitimate pattern.
      'react-hooks/set-state-in-effect': 'off',
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated service worker files:
    "public/sw.js",
    "public/workbox-*.js",
    // PocketBase migration scripts (not TypeScript source):
    "pb_migrations/**",
    // Legacy seeding script (superseded by pb_migrations):
    "seed.js",
  ]),
]);

export default eslintConfig;
