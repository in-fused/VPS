###############################################################################
# Webhook Handler — Lightweight Node.js HTTP server for workflow triggers
###############################################################################
# Receives POST requests from external services, validates per-webhook tokens,
# and triggers workflow execution via OpenClaw. Zero external dependencies
# beyond the ws library for OpenClaw WebSocket communication.
###############################################################################

FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY handler.js ./

CMD ["node", "handler.js"]
