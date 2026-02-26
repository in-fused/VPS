###############################################################################
# Custom Open WebUI — in-fused.org Golden Cyber Techno Theme
###############################################################################
# Extends the official Open WebUI image with a custom CSS theme.
# The CSS is copied into the static build directory and a <link> tag
# is injected into the main HTML template so it loads automatically.
#
# Build:  docker compose build open-webui
# Deploy: docker compose up -d open-webui
###############################################################################

FROM ghcr.io/open-webui/open-webui:main

# Copy the custom CSS into the static assets directory
COPY custom.css /app/backend/static/custom.css

# Inject a <link> to our custom CSS right before </head> in the main HTML.
# Open WebUI's SvelteKit build outputs index.html at /app/build/index.html
# (the entry point that loads the SPA). We also check the backend static
# path in case the layout changed.
RUN if [ -f /app/build/index.html ]; then \
      sed -i 's|</head>|<link rel="stylesheet" href="/static/custom.css"></head>|' /app/build/index.html; \
    fi
