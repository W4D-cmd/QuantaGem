FROM node:24-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:8510330d3eb72c804231a834b1a8ebb55cb3796c3e4431297a24d246b8add4d5 AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
CMD ["npm", "start"]
