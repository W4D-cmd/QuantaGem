FROM node:24-alpine@sha256:6ad8c47f099bc2440e0fc42f17a03297fa79955f559f10087cabf377c43ddbce AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine@sha256:6ad8c47f099bc2440e0fc42f17a03297fa79955f559f10087cabf377c43ddbce AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:6ad8c47f099bc2440e0fc42f17a03297fa79955f559f10087cabf377c43ddbce AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
CMD ["npm", "start"]
