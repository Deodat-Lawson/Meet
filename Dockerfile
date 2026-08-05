# syntax=docker/dockerfile:1

# ------------------------------------------------------------------ builder
FROM node:22-bookworm-slim AS builder

WORKDIR /app

# mediasoup downloads a prebuilt worker binary during install; the build toolchain
# is only a fallback for platforms without one.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 build-essential ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/client-core/package.json packages/client-core/
COPY packages/server/package.json packages/server/
COPY packages/web/package.json packages/web/

RUN npm ci

COPY tsconfig.base.json ./
COPY packages/ packages/

RUN npm run build -w @meet/protocol \
 && npm run build -w @meet/server \
 && npm run build -w @meet/web

# Drop dev dependencies from the tree we are going to copy forward.
RUN npm prune --omit=dev

# ------------------------------------------------------------------ runtime
FROM node:22-bookworm-slim AS runtime

WORKDIR /app

# ffmpeg is required only for server-side recording; drop it if RECORDING_ENABLED=false.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg ca-certificates tini \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=4000 \
    HOST=0.0.0.0 \
    SERVE_STATIC=true \
    STATIC_DIR=../web/dist \
    MEDIASOUP_USE_WEBRTC_SERVER=true

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/packages/protocol/dist ./packages/protocol/dist
COPY --from=builder /app/packages/protocol/package.json ./packages/protocol/package.json
COPY --from=builder /app/packages/server/dist ./packages/server/dist
COPY --from=builder /app/packages/server/package.json ./packages/server/package.json
COPY --from=builder /app/packages/web/dist ./packages/web/dist

RUN mkdir -p /app/recordings && chown -R node:node /app/recordings
USER node

EXPOSE 4000
# One UDP+TCP port per mediasoup worker when MEDIASOUP_USE_WEBRTC_SERVER=true.
EXPOSE 44444-44460/udp
EXPOSE 44444-44460/tcp

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini reaps the mediasoup worker processes so a container restart leaves nothing behind.
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "packages/server/dist/index.js"]
