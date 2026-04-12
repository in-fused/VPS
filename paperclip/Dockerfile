###############################################################################
# Paperclip — Build from source (no pre-built image on ghcr.io)
###############################################################################
# Multi-stage build matching upstream Dockerfile structure.
# Source: https://github.com/paperclipai/paperclip
###############################################################################

# ---------------------------------------------------------------------------
# Stage 1: Clone + install dependencies
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS deps

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

RUN NODE_OPTIONS="--max-old-space-size=1024" pnpm --filter @paperclipai/ui build \
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

# Strip .git and non-essential files not needed at runtime
# NOTE: Do NOT delete packages/*/src or server/src — the compiled server/dist/index.js
# imports @paperclipai/db/src/index.ts (and other workspace packages) via the tsx loader.
# pnpm symlinks server/node_modules/@paperclipai/* → packages/*, so deleting
# packages/*/src breaks the runtime module resolution.
RUN rm -rf .git .github docs cli/src ui/src \
    && find . -name '*.md' -not -path './node_modules/*' -delete 2>/dev/null || true

# ---------------------------------------------------------------------------
# Stage 3: Production image
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy entire monorepo — pnpm workspace symlinks in node_modules reference
# sibling packages (packages/db, packages/shared, packages/adapters, etc.)
# Cherry-picking dirs breaks the symlinks at runtime.
COPY --from=build /build ./

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
