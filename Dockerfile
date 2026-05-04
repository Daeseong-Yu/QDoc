FROM node:24.15.0-alpine

WORKDIR /app

ENV COREPACK_HOME=/usr/local/share/corepack

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @qdoc/db db:generate
RUN pnpm build

RUN mkdir -p /home/node/.cache /app/apps/web/.next/cache \
    && chown -R node:node /home/node /usr/local/share/corepack /app/apps/web/.next/cache

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

USER node

CMD ["pnpm", "start:web"]
