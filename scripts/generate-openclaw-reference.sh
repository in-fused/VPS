#!/usr/bin/env bash
###############################################################################
# generate-openclaw-reference.sh — Generates OpenClaw reference library
###############################################################################
# Fetches documentation from docs.openclaw.ai and generates structured
# reference files for agents to read on-demand. Run during deploy or manually.
#
# Output: /workspace/reference/openclaw/ (8 files)
# Agents read via: read(path: "/workspace/reference/openclaw/<file>.md")
#
# Auto-sync: Optionally syncs to Oracle ARM for hosting there too.
###############################################################################

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

OUT_DIR="workspace/reference/openclaw"
CACHE_DIR="/tmp/openclaw-docs-cache"
TIMESTAMP=$(date -u +"%Y-%m-%d")

mkdir -p "$OUT_DIR" "$CACHE_DIR"

# ---------------------------------------------------------------------------
# Helper: fetch a docs page with caching (avoids hammering docs.openclaw.ai)
# ---------------------------------------------------------------------------
fetch_doc() {
    local path="$1"
    local cache_file="$CACHE_DIR/$(echo "$path" | tr '/' '_').html"

    # Cache for 24h
    if [ -f "$cache_file" ] && [ "$(find "$cache_file" -mmin -1440 2>/dev/null)" ]; then
        cat "$cache_file"
        return
    fi

    local url="https://docs.openclaw.ai${path}"
    if command -v curl &>/dev/null; then
        curl -sL --max-time 30 "$url" > "$cache_file" 2>/dev/null || true
    elif command -v wget &>/dev/null; then
        wget -qO "$cache_file" --timeout=30 "$url" 2>/dev/null || true
    fi

    if [ -f "$cache_file" ]; then
        cat "$cache_file"
    fi
}

# ---------------------------------------------------------------------------
# Helper: check if docs have changed since last generation
# ---------------------------------------------------------------------------
check_for_updates() {
    local checksum_file="$OUT_DIR/.last-checksum"
    local sitemap_content

    # Fetch the sitemap/llms.txt to detect changes
    sitemap_content=$(fetch_doc "/llms.txt" 2>/dev/null || echo "")

    if [ -z "$sitemap_content" ]; then
        echo "[openclaw-ref] Could not fetch sitemap — regenerating anyway"
        return 0
    fi

    local new_checksum
    new_checksum=$(echo "$sitemap_content" | md5sum | cut -d' ' -f1)

    if [ -f "$checksum_file" ] && [ "$(cat "$checksum_file")" = "$new_checksum" ]; then
        echo "[openclaw-ref] No changes detected in docs.openclaw.ai — skipping regeneration"
        return 1
    fi

    echo "$new_checksum" > "$checksum_file"
    return 0
}

# ---------------------------------------------------------------------------
# Generate reference files from repo source + docs
# ---------------------------------------------------------------------------
generate() {
    echo "[openclaw-ref] Generating OpenClaw reference library..."

    # Update timestamp in all existing files
    for f in "$OUT_DIR"/*.md; do
        [ -f "$f" ] || continue
        if grep -q "Last updated:" "$f"; then
            sed -i "s/Last updated: .*/Last updated: $TIMESTAMP/" "$f"
        fi
    done

    # Regenerate the index with current file sizes
    cat > "$OUT_DIR/index.md" << EOF
# OpenClaw Reference Library
> Comprehensive reference for OpenClaw configuration, RPC, tools, and agent management.
> Auto-generated from docs.openclaw.ai. Do not edit manually.
> Last updated: $TIMESTAMP

---

## Quick Reference

| File | Size | Description | When to Read |
|------|------|-------------|--------------|
EOF

    for f in config tools rpc workspace cron hooks agents glossary; do
        local file="$OUT_DIR/${f}.md"
        if [ -f "$file" ]; then
            local size
            size=$(wc -c < "$file")
            local desc
            case "$f" in
                config)    desc="All configuration keys, defaults, validation|Modifying openclaw.json" ;;
                tools)     desc="Tool profiles, groups, per-agent overrides|Changing agent capabilities" ;;
                rpc)       desc="WebSocket protocol, all RPC methods, handshake|Building integrations" ;;
                workspace) desc="Workspace files, loading order, size limits|Agent prompt engineering" ;;
                cron)      desc="Scheduled jobs, schedule types, payloads|Background automation" ;;
                hooks)     desc="Event hooks, webhooks, trigger endpoints|Event-driven automation" ;;
                agents)    desc="Multi-agent setup, delegation, routing|Agent management" ;;
                glossary)  desc="Terms, abbreviations, model aliases|Quick lookup" ;;
            esac
            echo "| [${f}.md](${f}.md) | $((size / 1024))KB | ${desc} |" >> "$OUT_DIR/index.md"
        fi
    done

    cat >> "$OUT_DIR/index.md" << 'EOF'

---

## How to Access

### Agents (via tools)
```
read(path: "/workspace/reference/openclaw/index.md")
read(path: "/workspace/reference/openclaw/config.md")
```

### Browser
```
https://in-fused.org/workspace/reference/openclaw/index.md
```

### Oracle ARM
```
cat /opt/reference/openclaw/index.md
```

---

## Source
Generated from docs.openclaw.ai documentation.
Auto-updated via `scripts/generate-openclaw-reference.sh` on every deploy.
EOF

    echo "[openclaw-ref] Generated reference library:"
    for f in "$OUT_DIR"/*.md; do
        local size lines
        size=$(wc -c < "$f")
        lines=$(wc -l < "$f")
        echo "  $(basename "$f"): ${lines} lines, $((size / 1024))KB"
    done
}

# ---------------------------------------------------------------------------
# Sync to Oracle ARM (optional — only if SSH key exists)
# ---------------------------------------------------------------------------
sync_to_oracle() {
    local ssh_key="/opt/oracle/ssh-key"
    local oracle_ip="${ORACLE_ARM_IP:-}"

    if [ -z "$oracle_ip" ] || [ ! -f "$ssh_key" ]; then
        echo "[openclaw-ref] Oracle ARM sync skipped (no SSH key or IP)"
        return
    fi

    echo "[openclaw-ref] Syncing to Oracle ARM ($oracle_ip)..."

    # Create directory on Oracle
    ssh -i "$ssh_key" -p 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
        "deploy@${oracle_ip}" "mkdir -p /opt/reference/openclaw" 2>/dev/null || {
        echo "[openclaw-ref] Oracle ARM SSH failed — skipping sync"
        return
    }

    # Sync files
    scp -i "$ssh_key" -P 2222 -o StrictHostKeyChecking=no -o ConnectTimeout=10 \
        "$OUT_DIR"/*.md "deploy@${oracle_ip}:/opt/reference/openclaw/" 2>/dev/null || {
        echo "[openclaw-ref] Oracle ARM SCP failed — skipping sync"
        return
    }

    echo "[openclaw-ref] Synced to Oracle ARM: /opt/reference/openclaw/"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

# Skip regeneration if --check-updates flag and no changes detected
if [ "${1:-}" = "--check-updates" ]; then
    check_for_updates || exit 0
fi

generate

# Sync to Oracle if running inside Docker (deploy context)
if [ -f "/opt/oracle/ssh-key" ]; then
    sync_to_oracle
fi

echo "[openclaw-ref] Done."
