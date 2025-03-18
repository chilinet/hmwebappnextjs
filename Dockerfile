# Base image
FROM --platform=linux/amd64 node:18-alpine AS base
WORKDIR /app

# Dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
COPY package*.json ./
RUN npm install

# Builder
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && cp -r node_modules .next/standalone/

# Runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8080
ENV NEXT_TELEMETRY_DISABLED=1

# Install runtime dependencies and build tools
RUN apk add --no-cache libc6-compat python3 make g++

# Nicht-Root-Benutzer für Sicherheit
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Kopiere nur die notwendigen Dateien
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/.next/standalone ./
COPY package*.json ./

# Installiere sharp für die Runner-Umgebung
USER root
RUN npm install sharp --ignore-scripts=false --platform=linuxmusl
RUN chown -R nextjs:nodejs .

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"] 