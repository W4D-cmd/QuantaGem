# --- Stage 1: Dependencies ---
FROM node:24-bookworm-slim@sha256:b83af04d005d8e3716f542469a28ad2947ba382f6b4a76ddca0827a21446a540 AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates

COPY package*.json ./
RUN npm ci

# --- Stage 2: Builder ---
FROM node:24-bookworm-slim@sha256:b83af04d005d8e3716f542469a28ad2947ba382f6b4a76ddca0827a21446a540 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage 3: Runner (Distroless Nonroot) ---
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:210c30b4c1b0623fe951ca9aa1048ba6b9221f8204770e39787b4caef48f42ad AS runner

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
