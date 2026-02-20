# --- Stage 1: Dependencies ---
FROM node:24-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2 AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates

COPY package*.json ./
RUN npm ci

# --- Stage 2: Builder ---
FROM node:24-bookworm-slim@sha256:a81a03dd965b4052269a57fac857004022b522a4bf06e7a739e25e18bce45af2 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage 3: Runner (Distroless Nonroot) ---
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:2db85f3895c08288b04e41ee333278ab82dc6daaca49b2db9e7f8a990821b99c AS runner

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
