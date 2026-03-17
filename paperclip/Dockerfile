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

# ---------------------------------------------------------------------------
# Patch for /paperclip/ sub-directory deployment behind Caddy reverse proxy
# ---------------------------------------------------------------------------
# Problem: Caddy's handle_path strips /paperclip/ prefix, so Paperclip
# receives requests at /. But the browser loads assets and makes API calls
# using absolute paths (/assets/..., /api/...) which bypass the Caddy route.
#
# Fix 1: Set Vite base to /paperclip/ so asset URLs include the prefix
# Fix 2: After build, patch the hardcoded API base URL in compiled JS
# ---------------------------------------------------------------------------
RUN sed -i "s|defineConfig({|defineConfig({ base: '/paperclip/',|" ui/vite.config.ts \
    || sed -i "s|defineConfig({|defineConfig({ base: '/paperclip/',|" ui/vite.config.js \
    || true

RUN NODE_OPTIONS="--max-old-space-size=2048" pnpm --filter @paperclipai/ui build \
    && pnpm --filter @paperclipai/server build

# Patch API paths in compiled JS for /paperclip/ sub-directory deployment
# Source has: const BASE = "/api" (client.ts) and `/api/auth${path}` (auth.ts)
# Minified output may use double quotes, single quotes, or backtick templates
# All must be prefixed with /paperclip so Caddy routes them correctly
RUN find ui/dist -name '*.js' -exec sed -i \
        -e 's|"/api"|"/paperclip/api"|g' \
        -e "s|'/api'|'/paperclip/api'|g" \
        {} + \
    && find ui/dist -name '*.js' -exec sed -i \
        "s|\`/api|\`/paperclip/api|g" \
        {} +

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
