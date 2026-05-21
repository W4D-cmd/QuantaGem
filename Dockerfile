FROM node:24-alpine@sha256:fe770c8cac839c862b3de8ddfd5cf90c1dc9928c312d5ff24adc44818715f035 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine@sha256:fe770c8cac839c862b3de8ddfd5cf90c1dc9928c312d5ff24adc44818715f035 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:fe770c8cac839c862b3de8ddfd5cf90c1dc9928c312d5ff24adc44818715f035 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
CMD ["npm", "start"]
