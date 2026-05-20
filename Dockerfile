# --- Stage 1: Dependencies ---
FROM node:24-bookworm-slim@sha256:b809ce06df0b8f49f8a3015e23a38f47fabfa1052d4d6916655eaae0d9950ff9 AS deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates

COPY package*.json ./
RUN npm ci

# --- Stage 2: Builder ---
FROM node:24-bookworm-slim@sha256:b809ce06df0b8f49f8a3015e23a38f47fabfa1052d4d6916655eaae0d9950ff9 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# --- Stage 3: Runner (Distroless Nonroot) ---
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:b087b405441cd3e8eab9bd53ae3dd1c2b824e7ce13f25c5e9bb353fbdb3f4544 AS runner

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
