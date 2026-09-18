# syntax=docker/dockerfile:1

FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 gridwise

# Next.js "standalone" output: a self-contained server bundle plus only the
# node_modules it actually traced as needed (including @free-ai-gateway/core's
# on-disk provider catalog -- see next.config.mjs for why that matters).
COPY --from=builder --chown=gridwise:nodejs /app/.next/standalone ./
COPY --from=builder --chown=gridwise:nodejs /app/.next/static ./.next/static

USER gridwise

ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "server.js"]
