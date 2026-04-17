#!/bin/sh
###############################################################################
# oracle-tunnel.sh — SSH port-forward for Oracle ARM services
###############################################################################
# Forwards Oracle ports through SSH (port 22) so Caddy and OpenClaw can reach
# LiteLLM, Scrapling, and SearXNG without requiring Oracle VCN Security List
# changes (which would need Oracle Console access to configure).
#
# oracle-tunnel:4000 → Oracle LiteLLM  (:4000)
# oracle-tunnel:8000 → Oracle Scrapling (:8000)
# oracle-tunnel:8080 → Oracle SearXNG  (:8080)
###############################################################################

if [ -z "${ORACLE_ARM_IP:-}" ]; then
    echo '[oracle-tunnel] ORACLE_ARM_IP not set — tunnel disabled, sleeping'
    exec sleep infinity
fi

if [ ! -s /root/.ssh/oracle-key ]; then
    echo '[oracle-tunnel] oracle-instance-key is empty — tunnel disabled, sleeping'
    echo '[oracle-tunnel] Put your Oracle SSH private key at /home/VPS/oracle-instance-key on EC2'
    exec sleep infinity
fi

apk add --no-cache openssh-client > /dev/null 2>&1

# Copy key to a writable location so chmod works
# (the bind mount is :ro — can't chmod the mounted file directly)
cp /root/.ssh/oracle-key /tmp/oracle-key
chmod 600 /tmp/oracle-key

echo "[oracle-tunnel] Starting SSH tunnel to ubuntu@${ORACLE_ARM_IP}"
echo '[oracle-tunnel] Forwarding: :4000 (LiteLLM), :8000 (Scrapling), :8080 (SearXNG)'

while true; do
    ssh \
        -o StrictHostKeyChecking=no \
        -o ServerAliveInterval=30 \
        -o ServerAliveCountMax=3 \
        -o ExitOnForwardFailure=yes \
        -o ConnectTimeout=10 \
        -i /tmp/oracle-key \
        -L 0.0.0.0:4000:localhost:4000 \
        -L 0.0.0.0:8000:localhost:8000 \
        -L 0.0.0.0:8080:localhost:8080 \
        -N "ubuntu@${ORACLE_ARM_IP}" || true
    echo '[oracle-tunnel] Disconnected — retrying in 5s...'
    sleep 5
done
