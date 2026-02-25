FROM node:24-alpine@sha256:7b5a34685a2c783049dd76919cfec137b76f846151f0b6f855e539c833e219ac AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine@sha256:7b5a34685a2c783049dd76919cfec137b76f846151f0b6f855e539c833e219ac AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:7b5a34685a2c783049dd76919cfec137b76f846151f0b6f855e539c833e219ac AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
CMD ["npm", "start"]
