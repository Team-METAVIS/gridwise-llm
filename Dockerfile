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

LABEL org.opencontainers.image.title="GridWise LLM" \
      org.opencontainers.image.description="LLM-assisted 24-hour campus energy scheduling API and linear programming optimizer for BUP CSE Fest 2026 Hackathon" \
      org.opencontainers.image.authors="Team Metavis" \
      org.opencontainers.image.url="https://gridwise.zaber.dev" \
      org.opencontainers.image.source="https://github.com/Team-METAVIS/gridwise-llm" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.licenses="MIT"

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
