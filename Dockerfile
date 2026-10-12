# Stage 1: Dependency Installation
FROM node:24-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Application Builder
FROM node:24-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* wird zur Buildzeit ins Client-Bundle und in den generierten
# Service Worker eingebacken (next.config.mjs baut daraus die Workbox-Regeln),
# muss also hier als Build-Arg ankommen — eine Laufzeit-Env kaeme zu spaet.
ARG NEXT_PUBLIC_POCKETBASE_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_POCKETBASE_URL=${NEXT_PUBLIC_POCKETBASE_URL}
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Stage 3: Lightweight Production Runner
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy public assets & setup standalone directories
COPY --from=builder /app/public ./public

# Die AGPL verlangt, dass der Lizenztext die Software begleitet — auch im Image.
COPY --from=builder /app/LICENSE ./LICENSE

# Set proper permissions for prerendering cache directories
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Copy pre-built standalone server and static assets with secure permissions
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

# Damit Docker/Coolify einen haengenden Container erkennt statt ihn als
# "laeuft" zu melden. Ohne curl/wget im slim-Image: Node selbst fragt an.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Execute optimized standalone Next.js server
CMD ["node", "server.js"]
