#!/bin/sh
###############################################################################
# oracle-bridge.sh — Agent helper for Oracle ARM operations
###############################################################################
# Called by agents via: exec sh /opt/scripts/oracle-bridge.sh <command> [args]
#
# Provides a simple interface for agents to interact with Oracle Cloud ARM
# servers without needing to manage SSH options manually.
#
# Commands:
#   ssh <command>        — Run a command on Oracle ARM instance 1
#   ssh2 <command>       — Run a command on Oracle ARM instance 2
#   upload <local> <remote> — Copy file from container to Oracle instance 1
#   download <remote> <local> — Copy file from Oracle instance 1 to container
#   upload2 <local> <remote> — Copy file to Oracle instance 2
#   download2 <remote> <local> — Copy file from Oracle instance 2
#   status               — Check if Oracle instances are reachable
#   deploy <path>        — Deploy a project directory to Oracle instance 1
#   build <path>         — Run a build on Oracle (npm/node/python)
#   serve <port> <path>  — Start a simple HTTP server on Oracle
#   ps                   — List running processes on Oracle
#   logs <service>       — Tail logs from a service on Oracle
#   workspace            — Show agent workspace directories on Oracle
###############################################################################

set -eu

SSH_KEY="/opt/oracle/ssh-key"
SSH_USER="deploy"
SSH_PORT="2222"
SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o BatchMode=yes -o LogLevel=ERROR"
ORACLE_IP="${ORACLE_ARM_IP:-}"
ORACLE_IP_2="${ORACLE_ARM_IP_2:-}"
ORACLE_WORKSPACE="/home/deploy/agent-workspace"

# Validate SSH key exists and has correct permissions
if [ ! -f "$SSH_KEY" ]; then
    echo "ERROR: Oracle SSH key not found at $SSH_KEY"
    echo "The oracle-instance-key file must exist at /home/VPS/oracle-instance-key on EC2."
    exit 1
fi

# Fix permissions if needed (ro mount may have wrong perms)
# Copy key to tmp with correct perms since the mount is read-only
_prep_key() {
    if [ ! -f /tmp/.oracle-ssh-key ]; then
        cp "$SSH_KEY" /tmp/.oracle-ssh-key
        chmod 600 /tmp/.oracle-ssh-key
    fi
    SSH_KEY="/tmp/.oracle-ssh-key"
    SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=no -o ConnectTimeout=15 -o BatchMode=yes -o LogLevel=ERROR"
}

_check_ip() {
    local ip="$1"
    local label="$2"
    if [ -z "$ip" ]; then
        echo "ERROR: $label not configured."
        echo "Set $label in .env on EC2 and restart the stack."
        exit 1
    fi
}

_ssh() {
    local ip="$1"
    shift
    _prep_key
    ssh $SSH_OPTS -p "$SSH_PORT" "${SSH_USER}@${ip}" "$@"
}

_scp_up() {
    local ip="$1" src="$2" dst="$3"
    _prep_key
    scp $SSH_OPTS -P "$SSH_PORT" "$src" "${SSH_USER}@${ip}:${dst}"
}

_scp_down() {
    local ip="$1" src="$2" dst="$3"
    _prep_key
    scp $SSH_OPTS -P "$SSH_PORT" "${SSH_USER}@${ip}:${src}" "$dst"
}

CMD="${1:-help}"
shift 2>/dev/null || true

case "$CMD" in
    ssh)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        _ssh "$ORACLE_IP" "$@"
        ;;
    ssh2)
        _check_ip "$ORACLE_IP_2" "ORACLE_ARM_IP_2"
        _ssh "$ORACLE_IP_2" "$@"
        ;;
    upload)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        [ $# -lt 2 ] && echo "Usage: oracle-bridge.sh upload <local-path> <remote-path>" && exit 1
        _scp_up "$ORACLE_IP" "$1" "$2"
        echo "Uploaded $1 → oracle:$2"
        ;;
    download)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        [ $# -lt 2 ] && echo "Usage: oracle-bridge.sh download <remote-path> <local-path>" && exit 1
        _scp_down "$ORACLE_IP" "$1" "$2"
        echo "Downloaded oracle:$1 → $2"
        ;;
    upload2)
        _check_ip "$ORACLE_IP_2" "ORACLE_ARM_IP_2"
        [ $# -lt 2 ] && echo "Usage: oracle-bridge.sh upload2 <local-path> <remote-path>" && exit 1
        _scp_up "$ORACLE_IP_2" "$1" "$2"
        echo "Uploaded $1 → oracle2:$2"
        ;;
    download2)
        _check_ip "$ORACLE_IP_2" "ORACLE_ARM_IP_2"
        [ $# -lt 2 ] && echo "Usage: oracle-bridge.sh download2 <remote-path> <local-path>" && exit 1
        _scp_down "$ORACLE_IP_2" "$1" "$2"
        echo "Downloaded oracle2:$1 → $2"
        ;;
    status)
        echo "=== Oracle ARM Status ==="
        if [ -n "$ORACLE_IP" ]; then
            echo -n "Instance 1 ($ORACLE_IP): "
            if _ssh "$ORACLE_IP" "echo OK" 2>/dev/null; then
                _ssh "$ORACLE_IP" "uptime && echo '---' && df -h / | tail -1 && echo '---' && free -h | head -2"
            else
                echo "UNREACHABLE"
            fi
        else
            echo "Instance 1: NOT CONFIGURED"
        fi
        echo ""
        if [ -n "$ORACLE_IP_2" ]; then
            echo -n "Instance 2 ($ORACLE_IP_2): "
            if _ssh "$ORACLE_IP_2" "echo OK" 2>/dev/null; then
                _ssh "$ORACLE_IP_2" "uptime && echo '---' && df -h / | tail -1 && echo '---' && free -h | head -2"
            else
                echo "UNREACHABLE"
            fi
        else
            echo "Instance 2: NOT CONFIGURED"
        fi
        ;;
    deploy)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        [ $# -lt 1 ] && echo "Usage: oracle-bridge.sh deploy <local-project-dir>" && exit 1
        LOCAL_DIR="$1"
        PROJECT_NAME=$(basename "$LOCAL_DIR")
        REMOTE_DIR="${ORACLE_WORKSPACE}/${PROJECT_NAME}"
        echo "Deploying $LOCAL_DIR → oracle:$REMOTE_DIR"
        _ssh "$ORACLE_IP" "mkdir -p $REMOTE_DIR"
        # Use tar to transfer directory contents
        tar -cf - -C "$LOCAL_DIR" . | _ssh "$ORACLE_IP" "tar -xf - -C $REMOTE_DIR"
        echo "Deploy complete: $REMOTE_DIR"
        # Auto-detect and install deps
        _ssh "$ORACLE_IP" "cd $REMOTE_DIR && if [ -f package.json ]; then npm install --production 2>&1 | tail -3; elif [ -f requirements.txt ]; then pip3 install -r requirements.txt 2>&1 | tail -3; fi"
        echo "Project ready at oracle:$REMOTE_DIR"
        ;;
    build)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        [ $# -lt 1 ] && echo "Usage: oracle-bridge.sh build <remote-project-dir>" && exit 1
        REMOTE_DIR="$1"
        echo "Building on Oracle: $REMOTE_DIR"
        _ssh "$ORACLE_IP" "cd $REMOTE_DIR && if [ -f package.json ]; then npm run build 2>&1; elif [ -f Makefile ]; then make 2>&1; elif [ -f setup.py ]; then python3 setup.py build 2>&1; else echo 'No recognized build system found'; fi"
        ;;
    serve)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        [ $# -lt 2 ] && echo "Usage: oracle-bridge.sh serve <port> <directory>" && exit 1
        PORT="$1"
        DIR="$2"
        echo "Starting HTTP server on Oracle port $PORT serving $DIR"
        _ssh "$ORACLE_IP" "cd $DIR && nohup python3 -m http.server $PORT --bind 0.0.0.0 > /tmp/serve-${PORT}.log 2>&1 &"
        echo "Server started. Access via Oracle IP:$PORT"
        ;;
    ps)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        _ssh "$ORACLE_IP" "ps aux --sort=-%mem | head -20"
        ;;
    logs)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        [ $# -lt 1 ] && echo "Usage: oracle-bridge.sh logs <service-name-or-log-path>" && exit 1
        SERVICE="$1"
        if echo "$SERVICE" | grep -q '/'; then
            # Looks like a path
            _ssh "$ORACLE_IP" "tail -50 $SERVICE"
        else
            _ssh "$ORACLE_IP" "journalctl -u $SERVICE --no-pager -n 50 2>/dev/null || tail -50 /tmp/${SERVICE}.log 2>/dev/null || echo 'No logs found for $SERVICE'"
        fi
        ;;
    workspace)
        _check_ip "$ORACLE_IP" "ORACLE_ARM_IP"
        echo "=== Oracle Agent Workspace ==="
        _ssh "$ORACLE_IP" "ls -la $ORACLE_WORKSPACE 2>/dev/null || echo 'Workspace not initialized yet. Run: oracle-bridge.sh ssh mkdir -p $ORACLE_WORKSPACE'"
        ;;
    help|*)
        cat <<HELPEOF
oracle-bridge.sh — Agent helper for Oracle Cloud ARM operations

COMMANDS:
  ssh <cmd>              Run command on Oracle instance 1
  ssh2 <cmd>             Run command on Oracle instance 2
  upload <src> <dst>     Copy file to Oracle instance 1
  download <src> <dst>   Copy file from Oracle instance 1
  upload2 <src> <dst>    Copy file to Oracle instance 2
  download2 <src> <dst>  Copy file from Oracle instance 2
  status                 Check Oracle instance connectivity + resources
  deploy <dir>           Deploy project directory to Oracle (auto-installs deps)
  build <dir>            Run build in remote project directory
  serve <port> <dir>     Start HTTP server on Oracle
  ps                     List running processes
  logs <service>         Tail service logs
  workspace              List agent workspace contents

EXAMPLES:
  exec sh /opt/scripts/oracle-bridge.sh status
  exec sh /opt/scripts/oracle-bridge.sh ssh "free -h"
  exec sh /opt/scripts/oracle-bridge.sh ssh "node -v && npm -v"
  exec sh /opt/scripts/oracle-bridge.sh deploy /workspace/staging/my-app
  exec sh /opt/scripts/oracle-bridge.sh build /home/deploy/agent-workspace/my-app
  exec sh /opt/scripts/oracle-bridge.sh serve 3000 /home/deploy/agent-workspace/my-app
  exec sh /opt/scripts/oracle-bridge.sh ssh "cd /home/deploy/agent-workspace/my-app && node server.js &"

ENVIRONMENT:
  ORACLE_ARM_IP    — Instance 1 IP (from .env)
  ORACLE_ARM_IP_2  — Instance 2 IP (from .env)
  SSH key at /opt/oracle/ssh-key (mounted read-only from EC2)
HELPEOF
        ;;
esac
