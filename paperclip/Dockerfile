###############################################################################
# Paperclip — Build from source (no pre-built image on ghcr.io)
###############################################################################
# Multi-stage build matching upstream Dockerfile structure.
# Source: https://github.com/paperclipai/paperclip
###############################################################################

# ---------------------------------------------------------------------------
# Stage 1: Clone + install dependencies
# ---------------------------------------------------------------------------
FROM node:lts-trixie-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /build
RUN git clone --depth 1 --branch v0.3.1 https://github.com/paperclipai/paperclip.git .
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build UI + server
# ---------------------------------------------------------------------------
FROM deps AS build

RUN pnpm run build:ui && pnpm run build:server

# Verify server build output exists
RUN test -f server/dist/index.js || (echo "Server build failed" && exit 1)

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM node:lts-trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy built artifacts
COPY --from=build /build/server ./server
COPY --from=build /build/ui/dist ./ui/dist
COPY --from=build /build/package.json ./
COPY --from=build /build/node_modules ./node_modules

# Data directory
RUN mkdir -p /paperclip && chown node:node /paperclip
VOLUME /paperclip

ENV NODE_ENV=production
ENV PORT=3100
ENV HOST=0.0.0.0
ENV PAPERCLIP_HOME=/paperclip

EXPOSE 3100

USER node

CMD ["node", "--import", "./server/node_modules/tsx/dist/loader.mjs", "server/dist/index.js"]
