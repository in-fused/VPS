###############################################################################
# Custom Open WebUI — in-fused.org Golden Cyber Techno Theme
###############################################################################
# Extends the official Open WebUI image with a custom CSS theme.
# Open WebUI's SvelteKit template already includes:
#   <link rel="stylesheet" href="/static/custom.css">
# so we just need to place our CSS file in the right directory.
#
# Build:  docker compose build open-webui
# Deploy: docker compose up -d open-webui
###############################################################################

FROM ghcr.io/open-webui/open-webui:main

# Copy the custom CSS into Open WebUI's static assets directory.
# The Python backend mounts STATIC_DIR (open_webui/static/) at /static/,
# and the SPA already loads /static/custom.css on every page.
COPY custom.css /app/backend/open_webui/static/custom.css
