###############################################################################
# Custom Open WebUI — in-fused.org Golden Cyber Techno Theme
###############################################################################
# Extends the official Open WebUI image with a custom CSS theme.
# Open WebUI's SvelteKit build includes:
#   <link rel="stylesheet" href="/static/custom.css">
# so we place our CSS in the SvelteKit build output directory.
#
# Build:  docker compose build open-webui
# Deploy: docker compose up -d open-webui
###############################################################################

FROM ghcr.io/open-webui/open-webui:main

# Copy the custom CSS into Open WebUI's SvelteKit static assets directory.
# The frontend serves files from /app/build/static/ at the /static/ URL path.
COPY custom.css /app/build/static/custom.css
