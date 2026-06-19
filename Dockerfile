# --- Stage 1: Dependencies ---
FROM node:24-bookworm-slim@sha256:c2d5ade763cacfb03fe9cb8e8af5d1be5041ff331921fa26a9b231ca3a4f780a AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates

COPY package*.json ./
RUN npm ci

# --- Stage 2: Builder ---
FROM node:24-bookworm-slim@sha256:c2d5ade763cacfb03fe9cb8e8af5d1be5041ff331921fa26a9b231ca3a4f780a AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage 3: Runner (Distroless Nonroot) ---
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:34eb2e7dd86129508526b047950308de41663e33d059e19befb0361a12286d7c AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder --chown=65532:65532 /app/public ./public

COPY --from=builder --chown=65532:65532 /app/.next/standalone ./
COPY --from=builder --chown=65532:65532 /app/.next/static ./.next/static

EXPOSE 3000

CMD ["server.js"]
