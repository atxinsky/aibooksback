# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY tsconfig.json tsconfig.build.json vitest.config.ts ./
COPY src ./src
COPY test ./test
RUN npm run typecheck
RUN npm test
RUN npm run build

FROM node:20-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
ENV PORT=3021
ENV SESSION_COOKIE=liyan_session
ENV SESSION_DAYS=7
ENV AI_BOOK_BACK_STORE_FILE=/data/admin-store.json
ENV PUBLIC_BASE_URL=http://localhost:3021

WORKDIR /app
RUN apk add --no-cache su-exec
RUN mkdir -p /data && chown -R node:node /data /app
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3021
VOLUME ["/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3021) + '/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
