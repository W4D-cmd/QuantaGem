FROM node:24-alpine@sha256:ff2c02f071f9e56778013b47d70f7524f5d4eacb032027f0f434838d77cf25e0 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine@sha256:ff2c02f071f9e56778013b47d70f7524f5d4eacb032027f0f434838d77cf25e0 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:ff2c02f071f9e56778013b47d70f7524f5d4eacb032027f0f434838d77cf25e0 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
CMD ["npm", "start"]
