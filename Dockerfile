FROM node:24-alpine@sha256:abba54e1aa65f9d795ec66541e3e829986072483bf7812ea66df83dd69f95dae AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:24-alpine@sha256:abba54e1aa65f9d795ec66541e3e829986072483bf7812ea66df83dd69f95dae AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-alpine@sha256:abba54e1aa65f9d795ec66541e3e829986072483bf7812ea66df83dd69f95dae AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
CMD ["npm", "start"]
