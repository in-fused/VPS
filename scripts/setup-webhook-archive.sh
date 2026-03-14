#!/bin/bash
# ============================================================================
# Setup Webhook Archive Server on Oracle Cloud ARM
# ============================================================================
# Run this on the Oracle ARM instance (150.136.153.194) to set up the
# webhook payload archive service. Stores trigger payloads offloaded from EC2.
#
# Usage:
#   scp webhook/archive-server.js oracle-arm:/opt/webhook-archive/
#   ssh oracle-arm 'bash -s' < scripts/setup-webhook-archive.sh
#
# Or run directly on the Oracle ARM box:
#   bash scripts/setup-webhook-archive.sh
# ============================================================================

set -euo pipefail

ARCHIVE_DIR="/opt/webhook-archive"
ARCHIVE_PORT="${ARCHIVE_PORT:-9091}"
SERVICE_NAME="webhook-archive"

echo "=== Setting up Webhook Archive Server ==="

# Generate a random token if not set
if [ -z "${ARCHIVE_TOKEN:-}" ]; then
  ARCHIVE_TOKEN=$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)
  echo "Generated ARCHIVE_TOKEN: $ARCHIVE_TOKEN"
  echo ">>> Save this token! Add to EC2 .env as WEBHOOK_ARCHIVE_TOKEN=$ARCHIVE_TOKEN"
fi

# Create archive directory
mkdir -p "$ARCHIVE_DIR/data"

# Copy archive server (assumes it's in current dir or /opt/webhook-archive/)
if [ -f "webhook/archive-server.js" ]; then
  cp webhook/archive-server.js "$ARCHIVE_DIR/server.js"
elif [ -f "archive-server.js" ]; then
  cp archive-server.js "$ARCHIVE_DIR/server.js"
elif [ ! -f "$ARCHIVE_DIR/server.js" ]; then
  echo "ERROR: archive-server.js not found. Copy it to $ARCHIVE_DIR/server.js first."
  exit 1
fi

# Create systemd service
cat > /etc/systemd/system/${SERVICE_NAME}.service <<UNIT
[Unit]
Description=Webhook Archive Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node ${ARCHIVE_DIR}/server.js
Restart=always
RestartSec=5
Environment=ARCHIVE_PORT=${ARCHIVE_PORT}
Environment=ARCHIVE_TOKEN=${ARCHIVE_TOKEN}
Environment=ARCHIVE_DIR=${ARCHIVE_DIR}/data
Environment=ARCHIVE_MAX_GB=5
WorkingDirectory=${ARCHIVE_DIR}

[Install]
WantedBy=multi-user.target
UNIT

# Enable and start
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}
systemctl restart ${SERVICE_NAME}

echo ""
echo "=== Webhook Archive Server Running ==="
echo "Port: ${ARCHIVE_PORT}"
echo "Storage: ${ARCHIVE_DIR}/data (max 5 GB)"
echo "Service: systemctl status ${SERVICE_NAME}"
echo ""
echo ">>> Add these to EC2 /home/VPS/.env:"
echo "WEBHOOK_ARCHIVE_URL=http://150.136.153.194:${ARCHIVE_PORT}"
echo "WEBHOOK_ARCHIVE_TOKEN=${ARCHIVE_TOKEN}"
echo ""
echo ">>> Then redeploy: cd /home/VPS && sudo bash scripts/deploy.sh"

# Open firewall if iptables is available (Oracle ARM uses iptables)
if command -v iptables &>/dev/null; then
  # Only allow from EC2 (private network or specific IP)
  # For now, open the port — the bearer token provides auth
  iptables -I INPUT -p tcp --dport ${ARCHIVE_PORT} -j ACCEPT 2>/dev/null || true
  echo "Firewall: port ${ARCHIVE_PORT} opened"
fi
